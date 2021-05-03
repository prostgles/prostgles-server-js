"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Stefan L. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.filterObj = exports.PubSubManager = exports.DEFAULT_SYNC_BATCH_SIZE = exports.asValue = void 0;
const PostgresNotifListenManager_1 = require("./PostgresNotifListenManager");
const utils_1 = require("./utils");
const Bluebird = require("bluebird");
const pgPromise = require("pg-promise");
const prostgles_types_1 = require("prostgles-types");
let pgp = pgPromise({
    promiseLib: Bluebird
});
exports.asValue = v => pgp.as.format("$1", [v]);
exports.DEFAULT_SYNC_BATCH_SIZE = 50;
const log = (...args) => {
    if (process.env.TEST_TYPE) {
        console.log(...args);
    }
};
class PubSubManager {
    constructor(options) {
        this.onSchemaChange = null;
        this.NOTIF_TYPE = {
            data: "data_has_changed",
            schema: "schema_has_changed"
        };
        this.NOTIF_CHANNEL = {
            preffix: 'prostgles_',
            getFull: (appID) => {
                if (!this.appID && !appID)
                    throw "No appID";
                return this.NOTIF_CHANNEL.preffix + (appID || this.appID);
            }
        };
        this.appCheckFrequencyMS = 10 * 1000;
        this.init = () => __awaiter(this, void 0, void 0, function* () {
            try {
                const schema_version = 3;
                const q = `
                BEGIN; --  ISOLATION LEVEL SERIALIZABLE;-- TRANSACTION ISOLATION LEVEL SERIALIZABLE;

                --SET  TRANSACTION ISOLATION LEVEL SERIALIZABLE;

                DO
                $do$
                BEGIN

                    /* Drop older version */
                    IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'prostgles') THEN

                        IF
                            NOT EXISTS (
                                SELECT 1 
                                FROM information_schema.tables 
                                WHERE  table_schema = 'prostgles'
                                AND    table_name   = 'versions'
                            )
                        THEN
                            DROP SCHEMA IF EXISTS prostgles CASCADE;
                        ELSE 
                            IF NOT EXISTS(SELECT 1 FROM prostgles.versions WHERE version >= ${schema_version}) THEN
                                DROP SCHEMA IF EXISTS prostgles CASCADE;
                            END IF;
                        END IF;

                    END IF;

 
                    IF  NOT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'prostgles') 
                    THEN
                        --RAISE NOTICE 'CREATE SCHEMA IF NOT EXISTS prostgles';

                        CREATE SCHEMA IF NOT EXISTS prostgles;

                        CREATE TABLE IF NOT EXISTS prostgles.versions(
                            version NUMERIC PRIMARY KEY
                        );
                        INSERT INTO prostgles.versions(version) VALUES(${schema_version}) ON CONFLICT DO NOTHING;

                        CREATE OR REPLACE FUNCTION prostgles.random_string(length INTEGER DEFAULT 33) RETURNS TEXT AS $$
                            DECLARE
                                chars TEXT[] := '{0,1,2,3,4,5,6,7,8,9,A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y,Z,a,b,c,d,e,f,g,h,i,j,k,l,m,n,o,p,q,r,s,t,u,v,w,x,y,z}';
                                result TEXT := '';
                                i INTEGER := 0;
                            BEGIN
                            IF length < 0 THEN
                                RAISE exception 'Given length cannot be less than 0';
                            END IF;
                            FOR i IN 1..length LOOP
                                result := result || chars[1+random()*(array_length(chars, 1)-1)];
                            END LOOP;
                            RETURN result;
                            END;
                        $$ language plpgsql;
                        COMMENT ON FUNCTION prostgles.random_string IS 'UUIDs without installing pgcrypto';


                        CREATE OR REPLACE FUNCTION prostgles.debug(VARIADIC args TEXT[]) RETURNS VOID AS $$     
                            BEGIN

                                --PERFORM pg_notify('debug', concat_ws(' ', args));
                                IF
                                    NOT EXISTS (
                                        SELECT 1 
                                        FROM information_schema.tables 
                                        WHERE  table_schema = 'prostgles'
                                        AND    table_name   = 'debug'
                                    )
                                THEN
                                    CREATE TABLE IF NOT EXISTS prostgles.debug(m TEXT);
                                END IF;

                                INSERT INTO prostgles.debug(m) VALUES(concat_ws(' ', args));

                            END;
                        $$ LANGUAGE plpgsql;
                        COMMENT ON FUNCTION prostgles.debug IS 'Used for internal debugging';


                        CREATE TABLE IF NOT EXISTS prostgles.apps (
                            id                  TEXT PRIMARY KEY DEFAULT prostgles.random_string(),
                            added               TIMESTAMP DEFAULT NOW(),
                            application_name    TEXT,
                            last_check          TIMESTAMP NOT NULL DEFAULT NOW(),
                            watching_schema     BOOLEAN DEFAULT FALSE,
                            check_frequency_ms  INTEGER NOT NULL  
                        );
                        COMMENT ON TABLE prostgles.apps IS 'Keep track of prostgles server apps connected to db to combine common triggers. Heartbeat used due to no logout triggers in postgres';
                    

                        CREATE TABLE IF NOT EXISTS prostgles.triggers (
                            table_name      TEXT NOT NULL,
                            condition       TEXT NOT NULL,
                            app_ids         TEXT[] NOT NULL,
                            inserted        TIMESTAMP NOT NULL DEFAULT NOW(),
                            last_used       TIMESTAMP NOT NULL DEFAULT NOW(),
                            PRIMARY KEY (table_name, condition)
                        );
                        COMMENT ON TABLE prostgles.triggers IS 'Tables and conditions that are currently subscribed/synced';

                        CREATE OR REPLACE VIEW prostgles.v_triggers AS
                            SELECT *
                            , ROW_NUMBER() OVER( ORDER BY table_name, condition ) AS id
                            FROM prostgles.triggers;

                        CREATE OR REPLACE VIEW prostgles.v_triggers_unnested AS
                            SELECT *, ROW_NUMBER() OVER(PARTITION BY app_id, table_name ORDER BY table_name, condition ) - 1 AS c_id
                            FROM (
                                SELECT *, unnest(app_ids) as app_id
                                FROM prostgles.v_triggers
                            ) t;

                    /*
                        -- Force table into cache
                        IF EXISTS (select * from pg_extension where extname = 'pg_prewarm') THEN
                            CREATE EXTENSION IF NOT EXISTS pg_prewarm;
                            PERFORM pg_prewarm('prostgles.triggers');
                        END IF;
                    */


                        CREATE OR REPLACE FUNCTION ${this.DB_OBJ_NAMES.data_watch_func}() RETURNS TRIGGER 
                        AS $$
                
                            DECLARE c_ids INTEGER[];  
                            DECLARE err_c_ids INTEGER[]; 
                            DECLARE unions TEXT := '';          
                            DECLARE query TEXT := '';            
                            DECLARE nrw RECORD;               
                            DECLARE erw RECORD;     
                            DECLARE has_errors BOOLEAN := FALSE;
                            
                            DECLARE err_text    TEXT;
                            DECLARE err_detail  TEXT;
                            DECLARE err_hint    TEXT;
                            
                            BEGIN

                                PERFORM pg_notify('debug', concat_ws(' ', 'TABLE', TG_TABLE_NAME, TG_OP));

                                SELECT string_agg(
                                    concat_ws(
                                        E' UNION \n ',
                                        CASE WHEN (TG_OP = 'DELETE' OR TG_OP = 'UPDATE') THEN (p1 || ' old_table ' || p2) END,
                                        CASE WHEN (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN (p1 || ' new_table ' || p2) END 
                                    ),
                                    E' UNION \n '::text
                                )
                                INTO unions
                                FROM (
                                    SELECT 
                                        $z$ SELECT CASE WHEN EXISTS( SELECT 1 FROM $z$     AS p1,
                                        format( 
                                            $c$ as %I WHERE %s ) THEN %s::text END AS c_ids $c$
                                            , table_name, condition, id 
                                        ) AS p2
                                    FROM prostgles.v_triggers
                                    WHERE table_name = TG_TABLE_NAME
                                ) t;
                                

                                IF unions IS NOT NULL THEN
                                    query = format(
                                        $s$
                                            SELECT ARRAY_AGG(DISTINCT t.c_ids)
                                            FROM ( %s ) t
                                        $s$, 
                                        unions
                                    );

                                    BEGIN
                                        EXECUTE query INTO c_ids;

                                        --RAISE NOTICE 'trigger fired ok';

                                    EXCEPTION WHEN OTHERS THEN
                                        
                                        has_errors := TRUE;

                                        GET STACKED DIAGNOSTICS 
                                            err_text = MESSAGE_TEXT,
                                            err_detail = PG_EXCEPTION_DETAIL,
                                            err_hint = PG_EXCEPTION_HINT;


                                    END;

                                    --RAISE NOTICE 'has_errors: % ', has_errors;

                                    --RAISE NOTICE 'unions: % , cids: %', unions, c_ids;

                                    IF (c_ids IS NOT NULL OR has_errors) THEN

                                        FOR nrw IN
                                            SELECT app_id, string_agg(c_id::text, ',') as cids
                                            FROM prostgles.v_triggers_unnested 
                                            WHERE id = ANY(c_ids) 
                                            OR has_errors
                                            GROUP BY app_id
                                        LOOP
                                            
                                            PERFORM pg_notify( 
                                                ${exports.asValue(this.NOTIF_CHANNEL.preffix)} || nrw.app_id , 
                                                concat_ws(
                                                    ${exports.asValue(PubSubManager.DELIMITER)},
                                                    ${exports.asValue(this.NOTIF_TYPE.data)}, 
                                                    COALESCE(TG_TABLE_NAME, 'MISSING'), 
                                                    COALESCE(TG_OP, 'MISSING'), 
                                                    CASE WHEN has_errors 
                                                        THEN concat_ws('; ', 'error', err_text, err_detail, err_hint ) 
                                                        ELSE COALESCE(nrw.cids, '') 
                                                    END
                                                )
                                            );
                                        END LOOP;


                                        IF has_errors THEN

                                            DELETE FROM prostgles.triggers;
                                            RAISE NOTICE 'trigger dropped due to exception: % % %', err_text, err_detail, err_hint;

                                        END IF;

                                        
                                    END IF;
                                END IF;

        
                                RETURN NULL;
                                
                        /*
                            EXCEPTION WHEN OTHERS THEN 
                                DELETE FROM prostgles.triggers; -- delete all or will need to loop through all conditions to find issue;
                                RAISE NOTICE 'trigger dropped due to exception';
                                ${"--EXCEPTION_WHEN_COLUMN_WAS_RENAMED_THEN_DROP_TRIGGER"};
                            
                                

                                RETURN NULL; 
                                */
                            END;

                        --COMMIT;
                        $$ LANGUAGE plpgsql;
                        COMMENT ON FUNCTION ${this.DB_OBJ_NAMES.data_watch_func} IS 'Prostgles internal function used to notify when data in the table changed';



                        CREATE OR REPLACE FUNCTION ${this.DB_OBJ_NAMES.trigger_add_remove_func}() RETURNS TRIGGER 
                        AS $$
                
                            DECLARE operations TEXT[] := ARRAY['insert', 'update', 'delete'];
                            DECLARE op TEXT;
                            DECLARE query TEXT;
                            DECLARE trw RECORD;            
                            
                            BEGIN


                                --RAISE NOTICE 'prostgles.triggers % ', TG_OP;

                                /* If no other listeners on table then DROP triggers */
                                IF TG_OP = 'DELETE' THEN

                                    --RAISE NOTICE 'DELETE trigger_add_remove_func table: % ', ' ' || COALESCE((SELECT concat_ws(' ', string_agg(table_name, ' & '), count(*), min(inserted) ) FROM prostgles.triggers) , ' 0 ');
                                    --RAISE NOTICE 'DELETE trigger_add_remove_func old_table:  % ', '' || COALESCE((SELECT concat_ws(' ', string_agg(table_name, ' & '), count(*), min(inserted) ) FROM old_table), ' 0 ');


                                    FOR trw IN 
                                        SELECT DISTINCT table_name FROM old_table ot
                                        WHERE NOT EXISTS (
                                            SELECT 1 FROM prostgles.triggers t 
                                            WHERE t.table_name = ot.table_name
                                        ) 
                                    LOOP

                                        FOREACH op IN ARRAY operations
                                        LOOP 
                                            --RAISE NOTICE ' DROP DATA TRIGGER FOR:  % ', trw.table_name;
                                            EXECUTE format(' DROP TRIGGER IF EXISTS %I ON %I ;' , 'prostgles_triggers_' || trw.table_name || '_' || op, trw.table_name);
                                        END LOOP;
                                                     
                                    END LOOP;

                                /* If newly added listeners on table then CREATE triggers */
                                ELSIF TG_OP = 'INSERT' THEN
                                     

                                    --RAISE NOTICE 'INSERT trigger_add_remove_func table: % ', ' ' || COALESCE((SELECT concat_ws(' ', string_agg(table_name, ' & '), count(*), min(inserted) ) FROM prostgles.triggers) , ' 0 ');
                                    --RAISE NOTICE 'INSERT trigger_add_remove_func new_table:  % ', '' || COALESCE((SELECT concat_ws(' ', string_agg(table_name, ' & '), count(*), min(inserted) ) FROM new_table), ' 0 ');

                                    FOR trw IN  

                                        /* Loop through new table additions */
                                        SELECT DISTINCT table_name 
                                        FROM new_table nt
                                        WHERE NOT EXISTS (

                                            SELECT 1 FROM prostgles.triggers t 
                                            WHERE t.table_name = nt.table_name
                                            AND   t.inserted   < nt.inserted    -- exclude current record (this is an after trigger). Turn into before trigger?
                                        )

                                        /* Ignore invalid tables */
                                        AND  EXISTS (
                                            SELECT 1 
                                            FROM information_schema.tables 
                                            WHERE  table_schema = 'public'
                                            AND    table_name   = nt.table_name
                                        )
                                    LOOP
                                     
                                        /*
                                            RAISE NOTICE ' CREATE DATA TRIGGER FOR:  % TABLE EXISTS?', trw.table_name, SELECT EXISTS (
                                                SELECT 1 
                                                FROM information_schema.tables 
                                                WHERE  table_schema = 'public'
                                                AND    table_name   = nt.table_name
                                            );
                                        */

                                        query := format(
                                            $q$ 
                                                DROP TRIGGER IF EXISTS %1$I ON %2$I;
                                                CREATE TRIGGER %1$I
                                                AFTER INSERT ON %2$I
                                                REFERENCING NEW TABLE AS new_table
                                                FOR EACH STATEMENT EXECUTE PROCEDURE ${this.DB_OBJ_NAMES.data_watch_func}();
                                                COMMENT ON TRIGGER %1$I ON %2$I IS 'Prostgles internal trigger used to notify when data in the table changed';
                                            $q$,  
                                            'prostgles_triggers_' || trw.table_name || '_insert', trw.table_name                                                
                                        ) || format(
                                            $q$ 
                                                DROP TRIGGER IF EXISTS %1$I ON %2$I;
                                                CREATE TRIGGER %1$I
                                                AFTER UPDATE ON %2$I
                                                REFERENCING OLD TABLE AS old_table NEW TABLE AS new_table
                                                FOR EACH STATEMENT EXECUTE PROCEDURE ${this.DB_OBJ_NAMES.data_watch_func}();
                                                COMMENT ON TRIGGER %1$I ON %2$I IS 'Prostgles internal trigger used to notify when data in the table changed';
                                            $q$,  
                                            'prostgles_triggers_' || trw.table_name || '_update', trw.table_name   
                                        ) || format(
                                            $q$ 
                                                DROP TRIGGER IF EXISTS %1$I ON %2$I;
                                                CREATE TRIGGER %1$I
                                                AFTER DELETE ON %2$I
                                                REFERENCING OLD TABLE AS old_table
                                                FOR EACH STATEMENT EXECUTE PROCEDURE ${this.DB_OBJ_NAMES.data_watch_func}();
                                                COMMENT ON TRIGGER %1$I ON %2$I IS 'Prostgles internal trigger used to notify when data in the table changed';
                                            $q$,
                                            'prostgles_triggers_' || trw.table_name || '_delete', trw.table_name  
                                        );

                                        --RAISE NOTICE ' % ', query;

                                        
                                        query := format(
                                            $q$
                                                DO $e$ 
                                                BEGIN

                                                    IF EXISTS (
                                                        SELECT 1 
                                                        FROM information_schema.tables 
                                                        WHERE  table_schema = 'public'
                                                        AND    table_name   = %L
                                                    ) THEN

                                                        %s

                                                    END IF;

                                                END $e$;
                                            $q$,
                                            trw.table_name,
                                            query
                                        ) ;
                                        

                                        EXECUTE query;
                                                    
                                    END LOOP;

                                END IF;

        
                                RETURN NULL;
                            END;

                        $$ LANGUAGE plpgsql;
                        COMMENT ON FUNCTION ${this.DB_OBJ_NAMES.trigger_add_remove_func} IS 'Used to add/remove table watch triggers concurrently ';

                        DROP TRIGGER IF EXISTS prostgles_triggers_insert ON prostgles.triggers;
                        CREATE TRIGGER prostgles_triggers_insert
                        AFTER INSERT ON prostgles.triggers
                        REFERENCING NEW TABLE AS new_table
                        FOR EACH STATEMENT EXECUTE PROCEDURE ${this.DB_OBJ_NAMES.trigger_add_remove_func}();
                      
                        DROP TRIGGER IF EXISTS prostgles_triggers_delete ON prostgles.triggers;
                        CREATE TRIGGER prostgles_triggers_delete
                        AFTER DELETE ON prostgles.triggers
                        REFERENCING OLD TABLE AS old_table
                        FOR EACH STATEMENT EXECUTE PROCEDURE ${this.DB_OBJ_NAMES.trigger_add_remove_func}();
                      

                        CREATE OR REPLACE FUNCTION ${this.DB_OBJ_NAMES.schema_watch_func}() RETURNS event_trigger AS $$
                            
                            DECLARE curr_query TEXT := '';                                       
                            DECLARE arw RECORD;
                            
                            BEGIN
                            
                                --RAISE NOTICE 'SCHEMA_WATCH: %', tg_tag;
                    
                                IF
                                    EXISTS (
                                        SELECT 1 
                                        FROM information_schema.tables 
                                        WHERE  table_schema = 'prostgles'
                                        AND    table_name   = 'apps'
                                    )          
                                THEN

                                    SELECT LEFT(COALESCE(current_query(), ''), 5000)
                                    INTO curr_query;
                                    
                                    FOR arw IN 
                                        SELECT * FROM prostgles.apps WHERE watching_schema IS TRUE

                                    LOOP
                                        PERFORM pg_notify( 
                                            ${exports.asValue(this.NOTIF_CHANNEL.preffix)} || arw.id, 
                                            concat_ws(
                                                ${exports.asValue(PubSubManager.DELIMITER)}, 
                                                ${exports.asValue(this.NOTIF_TYPE.schema)}, tg_tag , TG_event, curr_query
                                            )
                                        );
                                    END LOOP;

                                END IF;

                            END;
                        $$ LANGUAGE plpgsql;
                        COMMENT ON FUNCTION ${this.DB_OBJ_NAMES.schema_watch_func} IS 'Prostgles internal function used to notify when schema has changed';

                    END IF;

                END
                $do$;


                COMMIT;
            `;
                // const prgl_exists = await this.db.oneOrNone(`
                //     DROP SCHEMA IF EXISTS prostgles CASCADE;
                //     SELECT 1 FROM information_schema.schemata WHERE schema_name = 'prostgles'
                // `);
                // if(!prgl_exists){
                //     await this.db.any(q); 
                // }
                yield this.db.any(q);
                /* Prepare App id */
                if (!this.appID) {
                    const raw = yield this.db.one("INSERT INTO prostgles.apps (check_frequency_ms, watching_schema, application_name) VALUES($1, $2, current_setting('application_name')) RETURNING *; ", [this.appCheckFrequencyMS, Boolean(this.onSchemaChange)]);
                    this.appID = raw.id;
                    if (!this.appCheck) {
                        this.appCheck = setInterval(() => __awaiter(this, void 0, void 0, function* () {
                            let appQ = "";
                            try { //  drop owned by api
                                let trgCond = "", listeners = this.getActiveListeners();
                                if (listeners.length) {
                                    trgCond = `
                                ,
                                last_used = CASE WHEN (table_name, condition) IN (
                                    ${listeners.map(l => ` ( ${exports.asValue(l.table_name)}, ${exports.asValue(l.condition)} ) `).join(", ")}
                                ) THEN NOW() ELSE last_used END
                                `;
                                }
                                appQ = `
                            
                                DO $$
                                BEGIN

                                    IF
                                        EXISTS (
                                            SELECT 1 
                                            FROM information_schema.tables 
                                            WHERE  table_schema = 'prostgles'
                                            AND    table_name   = 'apps'
                                        )
                                    THEN

                                        UPDATE prostgles.apps SET last_check = NOW()
                                        WHERE id = ${exports.asValue(this.appID)};

    /*
                                        IF EXISTS (
                                            SELECT 1 FROM prostgles.apps
                                            WHERE last_check < NOW() - 1.2 * check_frequency_ms * interval '1 millisecond'
                                        ) THEN

                                        END IF;
    */

                                        DELETE FROM prostgles.apps
                                        WHERE last_check < NOW() - check_frequency_ms * interval '1 millisecond';

                                        /* Delete unused triggers. Might deadlock */
                                        IF EXISTS ( SELECT 1 FROM prostgles.triggers)
                                            /* If this is the latest app then proceed */
                                            AND ( 
                                                SELECT id = ${exports.asValue(this.appID)} 
                                                FROM prostgles.apps 
                                                ORDER BY last_check DESC 
                                                LIMIT 1  
                                            ) = TRUE
                                        THEN

                                            /* TODO: Fixed deadlocks */
                                            --LOCK TABLE prostgles.triggers IN ACCESS EXCLUSIVE MODE;

                                            UPDATE prostgles.triggers
                                            SET app_ids = ARRAY(
                                                    SELECT DISTINCT unnest(app_ids) INTERSECT 
                                                    SELECT id FROM prostgles.apps
                                                )
                                                ${trgCond};

                                            DELETE FROM prostgles.triggers
                                            WHERE array_length(app_ids, 1) = 0
                                            OR last_used < NOW() - 2 * ${exports.asValue(this.appCheckFrequencyMS)} * interval '1 millisecond';

                                        END IF;

    
                                    END IF;

                                COMMIT;
                                END $$;
                            `;
                                yield this.db.any(appQ);
                                log("updated last_check");
                            }
                            catch (e) {
                                console.error("appCheck FAILED: \n", e, appQ);
                            }
                        }), 0.8 * this.appCheckFrequencyMS);
                    }
                }
                this.postgresNotifListenManager = new PostgresNotifListenManager_1.PostgresNotifListenManager(this.db, this.notifListener, this.NOTIF_CHANNEL.getFull());
                yield this.prepareTriggers();
                return this;
            }
            catch (e) {
                console.error("PubSubManager init failed: ", e);
            }
        });
        this.DB_OBJ_NAMES = {
            trigger_add_remove_func: "prostgles.trigger_add_remove_func",
            data_watch_func: "prostgles.prostgles_trigger_function",
            schema_watch_func: "prostgles.schema_watch_func",
            schema_watch_trigger: "prostgles_schema_watch_trigger_new"
        };
        this.prepareTriggers = () => __awaiter(this, void 0, void 0, function* () {
            // SELECT * FROM pg_catalog.pg_event_trigger WHERE evtname
            if (!this.appID)
                throw "prepareTriggers failed: this.appID missing";
            try {
                yield this.db.any(`
                BEGIN;--  ISOLATION LEVEL SERIALIZABLE;
                
                /**
                 *  Drop stale triggers
                 * */
                DO
                $do$
                    DECLARE trg RECORD;
                        q   TEXT;
                        ev_trg_needed BOOLEAN := FALSE;
                        ev_trg_exists BOOLEAN := FALSE;
                BEGIN
                    --SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
                    
                    LOCK TABLE prostgles.triggers IN ACCESS EXCLUSIVE MODE;
                    EXECUTE format(
                        $q$

                            CREATE TEMP TABLE %1$I AS --ON COMMIT DROP AS
                            SELECT * FROM prostgles.triggers;

                            DELETE FROM prostgles.triggers;

                            INSERT INTO prostgles.triggers
                            SELECT * FROM %1$I;

                            DROP TABLE IF EXISTS %1$I;
                        $q$, 
                        ${exports.asValue('triggers_' + this.appID)}
                    );
  
                    /**
                     *  Delete stale app records
                     * */
                            DELETE FROM prostgles.apps 
                            WHERE last_check < NOW() - check_frequency_ms * interval '1 millisecond'; 

                            /**
                             *  Remove inactive app ids 
                             * */
                            UPDATE prostgles.triggers 
                            SET app_ids = ARRAY(
                                SELECT DISTINCT unnest(app_ids) INTERSECT  
                                SELECT id FROM prostgles.apps
                            );

                            DELETE FROM prostgles.triggers
                            WHERE array_length(app_ids, 1) = 0;
                    
                    /* DROP the old buggy schema watch trigger */
                    IF EXISTS (
                        SELECT 1 FROM pg_catalog.pg_event_trigger
                        WHERE evtname = 'prostgles_schema_watch_trigger'
                    ) THEN
                        DROP EVENT TRIGGER IF EXISTS prostgles_schema_watch_trigger;
                    
                    END IF;

                    ev_trg_needed := EXISTS (SELECT 1 FROM prostgles.apps WHERE watching_schema IS TRUE);
                    ev_trg_exists := EXISTS (
                        SELECT 1 FROM pg_catalog.pg_event_trigger
                        WHERE evtname = ${exports.asValue(this.DB_OBJ_NAMES.schema_watch_trigger)}
                    );

                     -- RAISE NOTICE ' ev_trg_needed %, ev_trg_exists %', ev_trg_needed, ev_trg_exists;

                    /**
                     *  DROP stale event trigger
                     * */
                    IF ev_trg_needed IS FALSE AND ev_trg_exists IS TRUE THEN

                        SELECT format(
                            $$ DROP EVENT TRIGGER IF EXISTS %I ; $$
                            , ${exports.asValue(this.DB_OBJ_NAMES.schema_watch_trigger)}
                        )
                        INTO q;

                        --RAISE NOTICE ' DROP EVENT TRIGGER %', q;

                        EXECUTE q;

                    /**
                     *  CREATE event trigger
                     * */
                    ELSIF ev_trg_needed IS TRUE AND ev_trg_exists IS FALSE THEN

                        DROP EVENT TRIGGER IF EXISTS ${this.DB_OBJ_NAMES.schema_watch_trigger};
                        CREATE EVENT TRIGGER ${this.DB_OBJ_NAMES.schema_watch_trigger} ON ddl_command_end
                        WHEN TAG IN ('CREATE TABLE', 'ALTER TABLE', 'DROP TABLE', 'CREATE VIEW', 'DROP VIEW', 'ALTER VIEW', 'CREATE TABLE AS', 'SELECT INTO')
                        --WHEN TAG IN ('CREATE TABLE', 'ALTER TABLE', 'DROP TABLE', 'CREATE TRIGGER', 'DROP TRIGGER')
                        EXECUTE PROCEDURE ${this.DB_OBJ_NAMES.schema_watch_func}();

                        --RAISE NOTICE ' CREATED EVENT TRIGGER %', q;
                    END IF;
 
                    
                END
                $do$; 
  

                COMMIT;
            `).catch(e => {
                    console.error("prepareTriggers failed: ", e);
                    throw e;
                });
                return true;
            }
            catch (e) {
                console.error("prepareTriggers failed: ", e);
                throw e;
            }
        });
        /* Relay relevant data to relevant subscriptions */
        this.notifListener = (data) => __awaiter(this, void 0, void 0, function* () {
            const str = data.payload;
            if (!str) {
                console.error("Empty notif?");
                return;
            }
            const dataArr = str.split(PubSubManager.DELIMITER), notifType = dataArr[0];
            log(str);
            if (notifType === this.NOTIF_TYPE.schema) {
                if (this.onSchemaChange) {
                    const command = dataArr[1], event_type = dataArr[2], query = dataArr[3];
                    this.onSchemaChange({ command, query });
                }
                return;
            }
            if (notifType !== this.NOTIF_TYPE.data) {
                console.error("Unexpected notif type: ", notifType);
                return;
            }
            const table_name = dataArr[1], op_name = dataArr[2], condition_ids_str = dataArr[3];
            // const triggers = await this.db.any("SELECT * FROM prostgles.triggers WHERE table_name = $1 AND id IN ($2:csv)", [table_name, condition_ids_str.split(",").map(v => +v)]);
            // const conditions: string[] = triggers.map(t => t.condition);
            if (condition_ids_str && condition_ids_str.startsWith("error") &&
                this._triggers && this._triggers[table_name] && this._triggers[table_name].length) {
                const pref = "INTERNAL ERROR. Schema might have changed";
                console.error(`${pref}: ${condition_ids_str}`);
                this._triggers[table_name].map(c => {
                    const subs = this.getSubs(table_name, c);
                    subs.map(s => {
                        this.pushSubData(s, pref + ". Check server logs");
                    });
                });
            }
            else if (condition_ids_str &&
                condition_ids_str.split(",").length &&
                !condition_ids_str.split(",").find((c) => !Number.isInteger(+c)) &&
                this._triggers && this._triggers[table_name] && this._triggers[table_name].length) {
                const idxs = condition_ids_str.split(",").map(v => +v);
                const conditions = this._triggers[table_name].filter((c, i) => idxs.includes(i));
                // console.log({ table_name, op_name, condition_ids_str, conditions }, this._triggers[table_name]);
                conditions.map(condition => {
                    const subs = this.getSubs(table_name, condition);
                    const syncs = this.getSyncs(table_name, condition);
                    syncs.map((s) => {
                        // console.log("SYNC DATA FROM TRIGGER");
                        this.syncData(s, null);
                    });
                    if (!subs) {
                        // console.error(`sub missing for ${table_name} ${condition}`, this.triggers);
                        // console.log(this.subs)
                        return;
                    }
                    /* Throttle the subscriptions */
                    for (var i = 0; i < subs.length; i++) {
                        var sub = subs[i];
                        if (this.dbo[sub.table_name] &&
                            sub.is_ready &&
                            (sub.socket_id && this.sockets[sub.socket_id]) || sub.func) {
                            const throttle = sub.throttle;
                            if (sub.last_throttled <= Date.now() - throttle) {
                                /* It is assumed the policy was checked before this point */
                                this.pushSubData(sub);
                                // sub.last_throttled = Date.now();
                            }
                            else if (!sub.is_throttling) {
                                log("throttling sub");
                                sub.is_throttling = setTimeout(() => {
                                    log("throttling finished. pushSubData...");
                                    sub.is_throttling = null;
                                    this.pushSubData(sub);
                                }, throttle); // sub.throttle);
                            }
                        }
                    }
                });
            }
            else {
                // if(!this._triggers || !this._triggers[table_name] || !this._triggers[table_name].length){
                //     console.warn(190, "Trigger sub not found. DROPPING TRIGGER", table_name, condition_ids_str, this._triggers);
                //     this.dropTrigger(table_name);
                // } else {
                // }
                console.warn(190, "Trigger sub issue: ", table_name, condition_ids_str, this._triggers);
            }
        });
        this.syncTimeout = null;
        this.parseCondition = (condition) => Boolean(condition && condition.trim().length) ? condition : "TRUE";
        this.getActiveListeners = () => {
            let result = [];
            const add = (t, c) => {
                if (!result.find(r => r.table_name === t && r.condition === c)) {
                    result.push({ table_name: t, condition: c });
                }
            };
            (this.syncs || []).map(s => {
                add(s.table_name, s.condition);
            });
            Object.keys(this.subs || {}).map(table_name => {
                Object.keys(this.subs[table_name] || {}).map(condition => {
                    if (this.subs[table_name][condition].subs.length) {
                        add(table_name, condition);
                    }
                });
            });
            return result;
        };
        this.checkIfTimescaleBug = (table_name) => __awaiter(this, void 0, void 0, function* () {
            const schema = "_timescaledb_catalog", res = yield this.db.oneOrNone("SELECT EXISTS( \
            SELECT * \
            FROM information_schema.tables \
            WHERE 1 = 1 \
                AND table_schema = ${schema} \
                AND table_name = 'hypertable' \
        );", { schema });
            if (res.exists) {
                let isHyperTable = yield this.db.any("SELECT * FROM " + prostgles_types_1.asName(schema) + ".hypertable WHERE table_name = ${table_name};", { table_name, schema });
                if (isHyperTable && isHyperTable.length) {
                    throw "Triggers do not work on timescaledb hypertables due to bug:\nhttps://github.com/timescale/timescaledb/issues/1084";
                }
            }
            return true;
        });
        /*
            A table will only have a trigger with all conditions (for different subs)
                conditions = ["user_id = 1"]
                fields = ["user_id"]
        */
        this.getMyTriggerQuery = () => __awaiter(this, void 0, void 0, function* () {
            return pgp.as.format(` 
            SELECT * --, ROW_NUMBER() OVER(PARTITION BY table_name ORDER BY table_name, condition ) - 1 as id
            FROM prostgles.v_triggers_unnested
            WHERE app_id = $1
            ORDER BY table_name, condition
        `, [this.appID]);
        });
        this.addTriggerPool = undefined;
        const { db, dbo, wsChannelNamePrefix, pgChannelName, onSchemaChange, dboBuilder } = options;
        if (!db || !dbo) {
            throw 'MISSING: db_pg, db';
        }
        this.db = db;
        this.dbo = dbo;
        this.onSchemaChange = onSchemaChange;
        this.dboBuilder = dboBuilder;
        this.sockets = {};
        this.subs = {};
        this.syncs = [];
        this.socketChannelPreffix = wsChannelNamePrefix || "_psqlWS_";
        log("Created PubSubManager");
    }
    isReady() {
        return this.postgresNotifListenManager.isListening();
    }
    getSubs(table_name, condition) {
        return utils_1.get(this.subs, [table_name, condition, "subs"]);
    }
    getSyncs(table_name, condition) {
        return (this.syncs || [])
            .filter((s) => !s.is_syncing && s.table_name === table_name && s.condition === condition);
    }
    pushSubData(sub, err) {
        if (!sub)
            throw "pushSubData: invalid sub";
        const { table_name, filter, params, table_rules, socket_id, channel_name, func } = sub; //, subOne = false 
        sub.last_throttled = Date.now();
        if (err) {
            this.sockets[socket_id].emit(channel_name, { err });
            return true;
        }
        return new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
            /* TODO: Retire subOne -> it's redundant */
            // this.dbo[table_name][subOne? "findOne" : "find"](filter, params, null, table_rules)
            this.dbo[table_name].find(filter, params, null, table_rules)
                .then(data => {
                if (socket_id && this.sockets[socket_id]) {
                    log("Pushed " + data.length + " records to sub");
                    this.sockets[socket_id].emit(channel_name, { data }, () => {
                        resolve(data);
                    });
                    /* TO DO: confirm receiving data or server will unsubscribe
                            { data }, (cb)=> { console.log(cb) });
                    */
                }
                else if (func) {
                    func(data);
                    resolve(data);
                }
                sub.last_throttled = Date.now();
            }).catch(err => {
                const errObj = { _err_msg: err.toString(), err };
                if (socket_id && this.sockets[socket_id]) {
                    this.sockets[socket_id].emit(channel_name, { err: errObj });
                }
                else if (func) {
                    func({ err: errObj });
                }
                reject(errObj);
            });
        }));
    }
    upsertSocket(socket, channel_name) {
        if (socket && !this.sockets[socket.id]) {
            this.sockets[socket.id] = socket;
            socket.on("disconnect", () => this.onSocketDisconnected(socket, null));
        }
    }
    syncData(sync, clientData) {
        return __awaiter(this, void 0, void 0, function* () {
            // console.log("S", clientData)
            const { socket_id, channel_name, table_name, filter, table_rules, allow_delete = false, params, synced_field, id_fields = [], batch_size, isSyncingTimeout, wal, throttle } = sync, socket = this.sockets[socket_id];
            if (!socket)
                throw "Orphaned socket";
            const sync_fields = [synced_field, ...id_fields.sort()], orderByAsc = sync_fields.reduce((a, v) => (Object.assign(Object.assign({}, a), { [v]: true })), {}), orderByDesc = sync_fields.reduce((a, v) => (Object.assign(Object.assign({}, a), { [v]: false })), {}), 
            // desc_params = { orderBy: [{ [synced_field]: false }].concat(id_fields.map(f => ({ [f]: false }) )) },
            // asc_params = { orderBy: [synced_field].concat(id_fields) },
            rowsIdsMatch = (a, b) => {
                return a && b && !id_fields.find(key => (a[key]).toString() !== (b[key]).toString());
            }, rowsFullyMatch = (a, b) => {
                return rowsIdsMatch(a, b) && a[synced_field].toString() === b[synced_field].toString();
            }, getServerRowInfo = ({ from_synced = null, to_synced = null, end_offset = null } = {}) => __awaiter(this, void 0, void 0, function* () {
                let _filter = Object.assign({}, filter);
                if (from_synced || to_synced) {
                    _filter[synced_field] = Object.assign(Object.assign({}, (from_synced ? { $gte: from_synced } : {})), (to_synced ? { $lte: to_synced } : {}));
                }
                const first_rows = yield this.dbo[table_name].find(_filter, { orderBy: orderByAsc, select: sync_fields, limit: 1 }, null, table_rules);
                const last_rows = yield this.dbo[table_name].find(_filter, { orderBy: orderByDesc, select: sync_fields, limit: 1, offset: end_offset || 0 }, null, table_rules);
                const count = yield this.dbo[table_name].count(_filter, null, null, table_rules);
                return { s_fr: first_rows[0] || null, s_lr: last_rows[0] || null, s_count: count };
            }), getClientRowInfo = ({ from_synced = null, to_synced = null, end_offset = null } = {}) => {
                let res = new Promise((resolve, reject) => {
                    let onSyncRequest = { from_synced, to_synced, end_offset }; //, forReal: true };
                    socket.emit(channel_name, { onSyncRequest }, (resp) => {
                        if (resp.onSyncRequest) {
                            let c_fr = resp.onSyncRequest.c_fr, c_lr = resp.onSyncRequest.c_lr, c_count = resp.onSyncRequest.c_count;
                            // console.log(onSyncRequest, { c_fr, c_lr, c_count }, socket._user);
                            return resolve({ c_fr, c_lr, c_count });
                        }
                        else if (resp.err) {
                            reject(resp.err);
                        }
                    });
                });
                return res;
            }, getClientData = (from_synced = 0, offset = 0) => {
                return new Promise((resolve, reject) => {
                    const onPullRequest = { from_synced: from_synced || 0, offset: offset || 0, limit: batch_size };
                    socket.emit(channel_name, { onPullRequest }, (resp) => __awaiter(this, void 0, void 0, function* () {
                        if (resp && resp.data && Array.isArray(resp.data)) {
                            // console.log({ onPullRequest, resp }, socket._user)
                            resolve(sortClientData(resp.data));
                        }
                        else {
                            reject("unexpected onPullRequest response: " + JSON.stringify(resp));
                        }
                    }));
                });
                function sortClientData(data) {
                    return data.sort((a, b) => {
                        /* Order by increasing synced and ids (sorted alphabetically) */
                        return (a[synced_field] - b[synced_field]) || id_fields.sort().map(idKey => a[idKey] < b[idKey] ? -1 : a[idKey] > b[idKey] ? 1 : 0).find(v => v) || 0;
                    });
                }
            }, getServerData = (from_synced = 0, offset = 0) => __awaiter(this, void 0, void 0, function* () {
                let _filter = Object.assign(Object.assign({}, filter), { [synced_field]: { $gte: from_synced || 0 } });
                try {
                    return this.dbo[table_name].find(_filter, {
                        select: params.select,
                        orderBy: orderByAsc,
                        offset: offset || 0,
                        limit: batch_size
                    }, null, table_rules);
                }
                catch (e) {
                    console.error("Sync getServerData failed: ", e);
                    throw "INTERNAL ERROR";
                }
            }), deleteData = (deleted) => __awaiter(this, void 0, void 0, function* () {
                // console.log("deleteData deleteData  deleteData " + deleted.length);
                if (allow_delete) {
                    return Promise.all(deleted.map((d) => __awaiter(this, void 0, void 0, function* () {
                        const id_filter = filterObj(d, id_fields);
                        try {
                            yield this.dbo[table_name].delete(id_filter, null, null, table_rules);
                            return 1;
                        }
                        catch (e) {
                            console.error(e);
                        }
                        return 0;
                    })));
                }
                else {
                    console.warn("client tried to delete data without permission (allow_delete is false)");
                }
                return false;
            }), upsertData = (data, isExpress = false) => {
                let inserted = 0, updated = 0, total = data.length;
                // console.log("isExpress", isExpress, data);
                return this.dboBuilder.getTX((dbTX) => __awaiter(this, void 0, void 0, function* () {
                    const tbl = dbTX[table_name];
                    const existingData = yield tbl.find({ $or: data.map(d => filterObj(d, id_fields)) }, { select: [synced_field, ...id_fields], orderBy: orderByAsc,
                    }, null, table_rules);
                    const inserts = data.filter(d => !existingData.find(ed => rowsIdsMatch(ed, d)));
                    const updates = data.filter(d => existingData.find(ed => rowsIdsMatch(ed, d) && +ed[synced_field] < +d[synced_field]));
                    try {
                        if (table_rules.update && updates.length) {
                            let updateData = [];
                            yield Promise.all(updates.map(upd => {
                                const id_filter = filterObj(upd, id_fields);
                                const syncSafeFilter = { $and: [id_filter, { [synced_field]: { "<": upd[synced_field] } }] };
                                // return tbl.update(syncSafeFilter, filterObj(upd, [], id_fields), { fixIssues: true }, table_rules)
                                updateData.push([syncSafeFilter, filterObj(upd, [], id_fields)]);
                            }));
                            yield tbl.updateBatch(updateData, { fixIssues: true }, table_rules);
                            updated = updates.length;
                        }
                        if (table_rules.insert && inserts.length) {
                            // const qs = await tbl.insert(inserts, { fixIssues: true }, null, table_rules, { returnQuery: true });
                            // console.log("inserts", qs)
                            yield tbl.insert(inserts, { fixIssues: true }, null, table_rules);
                            inserted = inserts.length;
                        }
                        updated++;
                        return true;
                    }
                    catch (e) {
                        console.trace(e);
                        throw e;
                    }
                })).then(res => {
                    log(`upsertData: inserted( ${inserted} )    updated( ${updated} )     total( ${total} )`);
                    return { inserted, updated, total };
                })
                    .catch(err => {
                    console.trace("Something went wrong with syncing to server: \n ->", err, data.length, id_fields);
                    return Promise.reject("Something went wrong with syncing to server: ");
                });
                // return Promise.all(data.map(async (d, i) => {
                //     const id_filter = filterObj(d, id_fields);
                //     /* To account for client time deviation */
                //     /* This can break sync.lr logic (correct timestamps but recursive syncing) */
                //     // d[synced_field] = isExpress? (Date.now() + i) : Math.max(Date.now(), d[synced_field]);
                //     /* Select only the necessary fields when preparing to update */
                //     const exst = await this.dbo[table_name].find(id_filter, { select: { [synced_field]: 1 }, orderBy: (orderByAsc as OrderBy), limit: 1 }, null, table_rules);
                //     /* TODO: Add batch INSERT with ON CONFLICT DO UPDATE */
                //     if(exst && exst.length){
                //         // adwa dwa
                //         // console.log(exst[0], d)
                //         if(table_rules.update && +exst[0][synced_field] < +d[synced_field]){
                //             try {
                //                 const syncSafeFilter = { $and: [id_filter, { [synced_field]: { "<": d[synced_field] } } ] }
                //                 updated++;
                //                 await (this.dbo[table_name] as TableHandler).update(syncSafeFilter, filterObj(d, [], id_fields), { fixIssues: true }, table_rules);
                //             } catch(e) {
                //                 console.log(e);
                //                 throw e;
                //             }
                //         }
                //     } else if(table_rules.insert){
                //         try {
                //             inserted++;
                //             await (this.dbo[table_name] as TableHandler).insert(d, { fixIssues: true }, null, table_rules);
                //         } catch(e){
                //             console.log(e);
                //             throw e;
                //         }
                //     } else {
                //         console.error("SYNC onPullRequest UNEXPECTED CASE\n Data item does not exist on server and insert is not allowed !???");
                //         return false
                //     }
                //     return true;
                // }))
                // .then(res => {
                //     // console.log(`upsertData: inserted( ${inserted} )    updated( ${updated} )     total( ${total} )`);
                //     return { inserted , updated , total };
                // })
                // .catch(err => {
                //     console.error("Something went wrong with syncing to server: \n ->", err, data, id_fields);
                //     return Promise.reject("Something went wrong with syncing to server: ")
                // });
            }, pushData = (data, isSynced = false, err = null) => __awaiter(this, void 0, void 0, function* () {
                return new Promise((resolve, reject) => {
                    socket.emit(channel_name, { data, isSynced }, (resp) => {
                        if (resp && resp.ok) {
                            // console.log("PUSHED to client: fr/lr", data[0], data[data.length - 1]);
                            resolve({ pushed: data.length, resp });
                        }
                        else {
                            reject(resp);
                            console.error("Unexpected response");
                        }
                    });
                });
            }), getLastSynced = (clientData) => __awaiter(this, void 0, void 0, function* () {
                // Get latest row info
                const { c_fr, c_lr, c_count } = clientData || (yield getClientRowInfo());
                const { s_fr, s_lr, s_count } = yield getServerRowInfo();
                // console.log("getLastSynced", clientData, socket._user )
                let result = null;
                /* Nothing to sync */
                if (!c_fr && !s_fr || rowsFullyMatch(c_lr, s_lr)) { //  c_count === s_count && 
                    // sync.last_synced = null;
                    result = null;
                    /* Sync Everything */
                }
                else if (!rowsFullyMatch(c_fr, s_fr)) {
                    if (c_fr && s_fr) {
                        result = Math.min(c_fr[synced_field], s_fr[synced_field]);
                    }
                    else if (c_fr || s_fr) {
                        result = (c_fr || s_fr)[synced_field];
                    }
                    /* Sync from last matching synced value */
                }
                else if (rowsFullyMatch(c_fr, s_fr)) {
                    if (s_lr && c_lr) {
                        result = Math.min(c_lr[synced_field], s_lr[synced_field]);
                    }
                    else {
                        result = Math.min(c_fr[synced_field], s_fr[synced_field]);
                    }
                    let min_count = Math.min(c_count, s_count);
                    let end_offset = 1; // Math.min(s_count, c_count) - 1;
                    let step = 0;
                    while (min_count > 5 && end_offset < min_count) {
                        const { c_lr = null } = yield getClientRowInfo({ from_synced: 0, to_synced: result, end_offset });
                        // console.log("getLastSynced... end_offset > " + end_offset);
                        let server_row;
                        if (c_lr) {
                            let _filter = {};
                            sync_fields.map(key => {
                                _filter[key] = c_lr[key];
                            });
                            server_row = yield this.dbo[table_name].find(_filter, { select: sync_fields, limit: 1 }, null, table_rules);
                        }
                        // if(rowsFullyMatch(c_lr, s_lr)){ //c_count === s_count && 
                        if (server_row && server_row.length) {
                            server_row = server_row[0];
                            result = server_row[synced_field];
                            end_offset = min_count;
                            // console.log(`getLastSynced found for ${table_name} -> ${result}`);
                        }
                        else {
                            end_offset += 1 + step * (step > 4 ? 2 : 1);
                            // console.log(`getLastSynced NOT found for ${table_name} -> ${result}`);
                        }
                        step++;
                    }
                }
                return result;
            }), syncBatch = (from_synced) => __awaiter(this, void 0, void 0, function* () {
                let offset = 0, limit = batch_size, canContinue = true, min_synced = from_synced || 0, max_synced = from_synced;
                let inserted = 0, updated = 0, pushed = 0, deleted = 0, total = 0;
                // console.log("syncBatch", from_synced)
                while (canContinue) {
                    let cData = yield getClientData(min_synced, offset);
                    if (cData.length) {
                        let res = yield upsertData(cData);
                        inserted += res.inserted;
                        updated += res.updated;
                    }
                    let sData;
                    try {
                        sData = yield getServerData(min_synced, offset);
                    }
                    catch (e) {
                        console.trace("sync getServerData err", e);
                        yield pushData(undefined, undefined, "Internal error. Check server logs");
                    }
                    // console.log("allow_delete", table_rules.delete);
                    if (allow_delete && table_rules.delete) {
                        const to_delete = sData.filter(d => {
                            !cData.find(c => rowsIdsMatch(c, d));
                        });
                        yield Promise.all(to_delete.map(d => {
                            deleted++;
                            return this.dbo[table_name].delete(filterObj(d, id_fields), {}, null, table_rules);
                        }));
                        sData = yield getServerData(min_synced, offset);
                    }
                    let forClient = sData.filter(s => {
                        return !cData.find(c => rowsIdsMatch(c, s) &&
                            c[synced_field] >= s[synced_field]);
                    });
                    if (forClient.length) {
                        let res = yield pushData(forClient);
                        pushed += res.pushed;
                    }
                    if (sData.length) {
                        sync.lr = sData[sData.length - 1];
                        sync.last_synced = sync.lr[synced_field];
                        total += sData.length;
                    }
                    offset += sData.length;
                    // canContinue = offset >= limit;
                    canContinue = sData.length >= limit;
                    // console.log(`sData ${sData.length}      limit ${limit}`);
                }
                // console.log(`syncBatch ${table_name}: inserted( ${inserted} )    updated( ${updated} )   deleted( ${deleted} )    pushed( ${pushed} )     total( ${total} )`, socket._user );
                return true;
            });
            if (!wal) {
                sync.wal = new prostgles_types_1.WAL({
                    id_fields, synced_field, throttle, batch_size,
                    onSendStart: () => {
                        sync.is_syncing = true;
                    },
                    onSend: (data) => __awaiter(this, void 0, void 0, function* () {
                        // console.log("WAL upsertData START", data)
                        const res = yield upsertData(data, true);
                        // console.log("WAL upsertData END")
                        /******** */
                        /* TO DO -> Store and push patch updates instead of full data if and where possible */
                        /******** */
                        // 1. Store successfully upserted wal items for a couple of seconds
                        // 2. When pushing data to clients check if any matching wal items exist
                        // 3. Replace text fields with matching patched data
                        return res;
                    }),
                    onSendEnd: () => {
                        sync.is_syncing = false;
                        // console.log("syncData from WAL.onSendEnd")
                        this.syncData(sync, null);
                    },
                });
            }
            // console.log("syncData", clientData)
            /* Express data sent from client */
            if (clientData) {
                if (clientData.data && Array.isArray(clientData.data) && clientData.data.length) {
                    sync.wal.addData(clientData.data.map(d => ({ current: d })));
                    return;
                    // await upsertData(clientData.data, true);
                    /* Not expecting this anymore. use normal db.table.delete channel */
                }
                else if (clientData.deleted && Array.isArray(clientData.deleted) && clientData.deleted.length) {
                    yield deleteData(clientData.deleted);
                }
            }
            if (sync.wal.isSending() || sync.is_syncing) {
                if (!this.syncTimeout) {
                    this.syncTimeout = setTimeout(() => {
                        this.syncTimeout = null;
                        // console.log("SYNC FROM TIMEOUT")
                        this.syncData(sync, null);
                    }, throttle);
                }
                // console.log("SYNC THROTTLE")
                return;
            }
            sync.is_syncing = true;
            // from synced does not make sense. It should be sync.lr only!!!
            let from_synced = null;
            if (sync.lr) {
                const { s_lr } = yield getServerRowInfo();
                /* Make sure trigger is not firing on freshly synced data */
                if (!rowsFullyMatch(sync.lr, s_lr)) {
                    from_synced = sync.last_synced;
                }
                else {
                    // console.log("rowsFullyMatch")
                }
                // console.log(table_name, sync.lr[synced_field])
            }
            else {
                from_synced = yield getLastSynced(clientData);
            }
            if (from_synced !== null) {
                yield syncBatch(from_synced);
            }
            else {
                // console.log("from_synced is null")
            }
            yield pushData([], true);
            sync.is_syncing = false;
            // console.log(`Finished sync for ${table_name}`, socket._user);
        });
    }
    /* Returns a sync channel */
    addSync(syncParams) {
        return __awaiter(this, void 0, void 0, function* () {
            const { socket = null, table_info = null, table_rules = null, synced_field = null, allow_delete = null, id_fields = [], filter = {}, params, condition = "", throttle = 0 } = syncParams || {};
            let conditionParsed = this.parseCondition(condition);
            if (!socket || !table_info)
                throw "socket or table_info missing";
            const { name: table_name } = table_info, channel_name = `${this.socketChannelPreffix}.${table_name}.${JSON.stringify(filter)}.sync`;
            if (!synced_field)
                throw "synced_field missing from table_rules";
            this.upsertSocket(socket, channel_name);
            const upsertSync = () => {
                let newSync = {
                    channel_name,
                    table_name,
                    filter,
                    condition: conditionParsed,
                    synced_field,
                    id_fields,
                    allow_delete,
                    table_rules,
                    throttle: Math.max(throttle || 0, table_rules.sync.throttle || 0),
                    batch_size: utils_1.get(table_rules, "sync.batch_size") || exports.DEFAULT_SYNC_BATCH_SIZE,
                    last_throttled: 0,
                    socket_id: socket.id,
                    is_sync: true,
                    last_synced: 0,
                    lr: null,
                    table_info,
                    is_syncing: false,
                    isSyncingTimeout: null,
                    wal: undefined,
                    socket,
                    params
                };
                /* Only a sync per socket per table per condition allowed */
                this.syncs = this.syncs || [];
                let existing = this.syncs.find(s => s.socket_id === socket.id && s.channel_name === channel_name);
                if (!existing) {
                    this.syncs.push(newSync);
                    // console.log("Added SYNC");
                    socket.removeAllListeners(channel_name + "unsync");
                    socket.once(channel_name + "unsync", () => {
                        this.onSocketDisconnected(socket, channel_name);
                    });
                    socket.removeAllListeners(channel_name);
                    socket.on(channel_name, (data, cb) => {
                        if (!data) {
                            cb({ err: "Unexpected request. Need data or onSyncRequest" });
                            return;
                        }
                        /*
                        */
                        /* Server will:
                            1. Ask for last_synced  emit(onSyncRequest)
                            2. Ask for data >= server_synced    emit(onPullRequest)
                                -> Upsert that data
                            2. Push data >= last_synced     emit(data.data)

                           Client will:
                            1. Send last_synced     on(onSyncRequest)
                            2. Send data >= server_synced   on(onPullRequest)
                            3. Send data on CRUD    emit(data.data | data.deleted)
                            4. Upsert data.data | deleted     on(data.data | data.deleted)
                        */
                        // if(data.data){
                        //     console.error("THIS SHOUKD NEVER FIRE !! NEW DATA FROM SYNC");
                        //     this.upsertClientData(newSync, data.data);
                        // } else 
                        if (data.onSyncRequest) {
                            // console.log("syncData from socket")
                            this.syncData(newSync, data.onSyncRequest);
                            // console.log("onSyncRequest ", socket._user)
                        }
                    });
                    // socket.emit(channel_name, { onSyncRequest: true }, (response) => {
                    //     console.log(response)
                    // });
                }
                else {
                    console.error("UNCLOSED DUPLICATE SYNC FOUND");
                }
                return newSync;
            };
            // const { min_id, max_id, count, max_synced } = params;
            let sync = upsertSync();
            yield this.addTrigger({ table_name, condition: conditionParsed });
            return channel_name;
        });
    }
    /* Must return a channel for socket */
    /* The distinct list of channel names must have a corresponding trigger in the database */
    addSub(subscriptionParams) {
        return __awaiter(this, void 0, void 0, function* () {
            const { socket = null, func = null, table_info = null, table_rules = null, filter = {}, params = {}, condition = "", throttle = 0 //subOne = false, 
             } = subscriptionParams || {};
            let validated_throttle = subscriptionParams.throttle || 10;
            if ((!socket && !func) || !table_info)
                throw "socket/func or table_info missing";
            const pubThrottle = utils_1.get(table_rules, ["subscribe", "throttle"]) || 0;
            if (pubThrottle && Number.isInteger(pubThrottle) && pubThrottle > 0) {
                validated_throttle = pubThrottle;
            }
            if (throttle && Number.isInteger(throttle) && throttle >= pubThrottle) {
                validated_throttle = throttle;
            }
            let channel_name = `${this.socketChannelPreffix}.${table_info.name}.${JSON.stringify(filter)}.${JSON.stringify(params)}.${"m"}.sub`; //.${subOne? "o" : "m"}.sub`;
            this.upsertSocket(socket, channel_name);
            const upsertSub = (newSubData) => {
                const { table_name, condition: _cond, is_ready = false } = newSubData, condition = this.parseCondition(_cond), newSub = {
                    socket,
                    table_name: table_info.name,
                    table_info,
                    filter,
                    params,
                    table_rules,
                    channel_name,
                    func: func ? func : null,
                    socket_id: socket ? socket.id : null,
                    throttle: validated_throttle,
                    is_throttling: null,
                    last_throttled: 0,
                    is_ready,
                };
                this.subs[table_name] = this.subs[table_name] || {};
                this.subs[table_name][condition] = this.subs[table_name][condition] || { subs: [] };
                this.subs[table_name][condition].subs = this.subs[table_name][condition].subs || [];
                // console.log("1034 upsertSub", this.subs)
                const sub_idx = this.subs[table_name][condition].subs.findIndex(s => s.channel_name === channel_name &&
                    (socket && s.socket_id === socket.id ||
                        func && s.func === func));
                if (sub_idx < 0) {
                    this.subs[table_name][condition].subs.push(newSub);
                    if (socket) {
                        const chnUnsub = channel_name + "unsubscribe";
                        socket.removeAllListeners(chnUnsub);
                        socket.once(chnUnsub, () => this.onSocketDisconnected(socket, channel_name));
                    }
                }
                else {
                    this.subs[table_name][condition].subs[sub_idx] = newSub;
                }
                if (is_ready) {
                    this.pushSubData(newSub);
                }
            };
            if (table_info.is_view && table_info.parent_tables) {
                if (table_info.parent_tables.length) {
                    let _condition = "TRUE";
                    table_info.parent_tables.map((table_name) => __awaiter(this, void 0, void 0, function* () {
                        upsertSub({
                            table_name,
                            condition: _condition,
                            is_ready: true
                        });
                        yield this.addTrigger({
                            table_name,
                            condition: _condition
                        });
                        upsertSub({
                            table_name,
                            condition: _condition,
                            is_ready: true
                        });
                    }));
                    return channel_name;
                }
                else {
                    throw "PubSubManager: view parent_tables missing";
                }
                /*  */
            }
            else {
                /* Just a table, add table + condition trigger */
                // console.log(table_info, 202);
                upsertSub({
                    table_name: table_info.name,
                    condition: this.parseCondition(condition),
                    is_ready: false
                });
                yield this.addTrigger({
                    table_name: table_info.name,
                    condition: this.parseCondition(condition),
                });
                upsertSub({
                    table_name: table_info.name,
                    condition: this.parseCondition(condition),
                    is_ready: true
                });
                return channel_name;
            }
        });
    }
    removeLocalSub(table_name, condition, func) {
        let cond = this.parseCondition(condition);
        if (utils_1.get(this.subs, [table_name, cond, "subs"])) {
            this.subs[table_name][cond].subs.map((sub, i) => {
                if (sub.func && sub.func === func) {
                    this.subs[table_name][cond].subs.splice(i, 1);
                }
            });
        }
        else {
            console.error("Could not unsubscribe. Subscription might not have initialised yet");
        }
    }
    onSocketDisconnected(socket, channel_name) {
        // process.on('warning', e => {
        //     console.warn(e.stack)
        // });
        // console.log("onSocketDisconnected", channel_name, this.syncs)
        if (this.subs) {
            Object.keys(this.subs).map(table_name => {
                Object.keys(this.subs[table_name]).map(condition => {
                    this.subs[table_name][condition].subs.map((sub, i) => {
                        /**
                         * If a channel name is specified then delete triggers
                         */
                        if (sub.socket_id === socket.id &&
                            (!channel_name || sub.channel_name === channel_name)) {
                            this.subs[table_name][condition].subs.splice(i, 1);
                            if (!this.subs[table_name][condition].subs.length) {
                                delete this.subs[table_name][condition];
                                if (prostgles_types_1.isEmpty(this.subs[table_name])) {
                                    delete this.subs[table_name];
                                }
                            }
                        }
                    });
                });
            });
        }
        if (this.syncs) {
            this.syncs = this.syncs.filter(s => {
                if (channel_name) {
                    return s.socket_id !== socket.id || s.channel_name !== channel_name;
                }
                return s.socket_id !== socket.id;
            });
        }
        if (!channel_name) {
            delete this.sockets[socket.id];
        }
        else {
            socket.removeAllListeners(channel_name);
            socket.removeAllListeners(channel_name + "unsync");
            socket.removeAllListeners(channel_name + "unsubscribe");
        }
    }
    addTrigger(params) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                let { table_name, condition } = Object.assign({}, params);
                if (!table_name)
                    throw "MISSING table_name";
                if (!this.appID)
                    throw "MISSING appID";
                if (!condition || !condition.trim().length)
                    condition = "TRUE";
                const app_id = this.appID;
                // console.log(1623, { app_id, addTrigger: { table_name, condition } });
                yield this.checkIfTimescaleBug(table_name);
                const trgVals = {
                    tbl: exports.asValue(table_name),
                    cond: exports.asValue(condition),
                    appID: exports.asValue(app_id),
                };
                yield this.db.any(`
                BEGIN WORK;
                LOCK TABLE prostgles.triggers IN ACCESS EXCLUSIVE MODE;

                INSERT INTO prostgles.triggers (table_name, condition, app_ids) 
                    VALUES (${trgVals.tbl}, ${trgVals.cond}, ARRAY[${trgVals.appID}])
                    ON CONFLICT (table_name, condition) DO UPDATE 
                    SET app_ids = ARRAY(SELECT DISTINCT UNNEST(prostgles.triggers.app_ids || EXCLUDED.app_ids));
                     
                COMMIT WORK;
            `);
                log("addTrigger.. ", { table_name, condition });
                const triggers = yield this.db.any(yield this.getMyTriggerQuery());
                this._triggers = {};
                triggers.map(t => {
                    this._triggers[t.table_name] = this._triggers[t.table_name] || [];
                    if (!this._triggers[t.table_name].includes(t.condition)) {
                        this._triggers[t.table_name].push(t.condition);
                    }
                });
                log("trigger added.. ", { table_name, condition });
                return true;
                // console.log("1612", JSON.stringify(triggers, null, 2))
                // console.log("1613",JSON.stringify(this._triggers, null, 2))
            }
            catch (e) {
                console.trace("Failed adding trigger", e);
                // throw e
            }
        });
    }
    /* info_level:
        0   -   min_id, max_id, count
        1   -   missing_ids
        */
    pushSyncInfo({ table_name, id_key = "id", info_level = 0 }) {
        return this.db.any(`            
            SELECT ${id_key}
            FROM generate_series(
                (SELECT MIN(msg_id) FROM ${table_name}) ,
                (SELECT MAX(msg_id) FROM ${table_name})
            ) ${id_key}
            WHERE NOT EXISTS (
                SELECT 1 
                FROM ${table_name} n
                WHERE n.msg_id = ${id_key}.${id_key}
            )
        `);
    }
}
exports.PubSubManager = PubSubManager;
PubSubManager.DELIMITER = '|$prstgls$|';
//     ,datname
//     ,usename
//     ,client_hostname
//     ,client_port
//     ,backend_start
//     ,query_start
//     ,query
//     ,state
//     console.log(await _db.any(`
//         SELECT pid, application_name, state
//         FROM pg_stat_activity
//         WHERE application_name IS NOT NULL AND application_name != '' -- state = 'active';
//     `))
PubSubManager.create = (options) => __awaiter(void 0, void 0, void 0, function* () {
    const res = new PubSubManager(options);
    return yield res.init();
});
/* Get only the specified properties of an object */
function filterObj(obj, keys = [], exclude) {
    if (exclude && exclude.length)
        keys = Object.keys(obj).filter(k => !exclude.includes(k));
    if (!keys.length) {
        // console.warn("filterObj: returning empty object");
        return {};
    }
    if (obj && keys.length) {
        let res = {};
        keys.map(k => {
            res[k] = obj[k];
        });
        return res;
    }
    return obj;
}
exports.filterObj = filterObj;
//# sourceMappingURL=PubSubManager.js.map