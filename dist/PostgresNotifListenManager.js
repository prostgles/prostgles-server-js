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
exports.PostgresNotifListenManager = void 0;
class PostgresNotifListenManager {
    constructor(db_pg, notifListener, db_channel_name, noInit = false) {
        this.destroy = () => {
            if (this.connection)
                this.connection.done();
        };
        this.stopListening = () => {
            if (this.db_channel_name) {
                if (this.connection)
                    this.connection.none('UNLISTEN $1~', this.db_channel_name);
                if (this.client)
                    this.client.query('UNLISTEN $1~', this.db_channel_name);
            }
        };
        if (!db_pg || !notifListener || !db_channel_name)
            throw "PostgresNotifListenManager: db_pg OR notifListener OR db_channel_name MISSING";
        this.db_pg = db_pg;
        this.notifListener = notifListener;
        this.db_channel_name = db_channel_name;
        if (!noInit)
            this.init();
    }
    init() {
        return __awaiter(this, void 0, void 0, function* () {
            this.connection = null;
            this.isListening = yield this.startListening();
            return this;
        });
    }
    isReady() {
        return this.isListening;
    }
    startListening() {
        if (!this.db_pg || !this.notifListener)
            throw "PostgresNotifListenManager: db_pg OR notifListener missing";
        return this.reconnect() // = same as reconnect(0, 1)
            .then(obj => {
            return obj;
            /* TODO: expose this within onReady */
            // console.log('psqlWS - Successful Initial Connection');
            // obj.done(); - releases the connection
            /*  HOW TO SEND NOTIF
                Used for testing in conjunction with
                SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='db-name';

                function sendNotifications() {
                    if (this.connection) {
                        this.connection.none('NOTIFY $1~, $2', [this.db_channel_name, 'my payload string'])
                            .catch(error => {
                                console.log('psqlWS - Failed to Notify:', error); // unlikely to ever happen
                            })
                    }
                }
            */
        })
            .catch(error => {
            console.log('PostgresNotifListenManager: Failed Initial Connection:', error);
        });
    }
    reconnect(delay = null, maxAttempts = null) {
        if (!this.db_pg || !this.notifListener)
            throw "db_pg OR notifListener missing";
        delay = delay > 0 ? parseInt(delay) : 0;
        maxAttempts = maxAttempts > 0 ? parseInt(maxAttempts) : 1;
        const setListeners = (client, notifListener, db_channel_name) => {
            client.on('notification', notifListener);
            this.client = client;
            return this.connection.none('LISTEN $1~', db_channel_name)
                .catch(error => {
                console.log("PostgresNotifListenManager: unexpected error: ", error); // unlikely to ever happen
            });
        }, removeListeners = (client) => {
            client.removeListener('notification', this.notifListener);
        }, onConnectionLost = (err, e) => {
            console.log('PostgresNotifListenManager: Connectivity Problem:', err);
            this.connection = null; // prevent use of the broken connection
            removeListeners(e.client);
            this.reconnect(5000, 10) // retry 10 times, with 5-second intervals
                .then(() => {
                console.log('PostgresNotifListenManager: Successfully Reconnected');
            })
                .catch(() => {
                // failed after 10 attempts
                console.log('PostgresNotifListenManager: Connection Lost Permanently. TERMINATING NODE PROCESS');
                process.exit(); // exiting the process
            });
        };
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                this.db_pg.connect({ direct: true, onLost: onConnectionLost })
                    .then(obj => {
                    this.connection = obj; // global connection is now available
                    resolve(obj);
                    return setListeners(obj.client, this.notifListener, this.db_channel_name);
                })
                    .catch(error => {
                    console.log('PostgresNotifListenManager: Error Connecting:', error);
                    if (--maxAttempts) {
                        this.reconnect(delay, maxAttempts)
                            .then(resolve)
                            .catch(reject);
                    }
                    else {
                        reject(error);
                    }
                });
            }, delay);
        });
    }
}
exports.PostgresNotifListenManager = PostgresNotifListenManager;
PostgresNotifListenManager.create = (db_pg, notifListener, db_channel_name) => {
    let res = new PostgresNotifListenManager(db_pg, notifListener, db_channel_name, true);
    return res.init();
};
//# sourceMappingURL=PostgresNotifListenManager.js.map