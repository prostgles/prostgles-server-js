import { log, PubSubManager } from "./PubSubManager";

/* Relay relevant data to relevant subscriptions */
export async function notifListener(this: PubSubManager, data: { payload: string }) {
  const str = data.payload;

  if (!str) {
    console.error("Unexpected Empty notif")
    return;
  }

  const dataArr = str.split(PubSubManager.DELIMITER);
  const notifType = dataArr[0];

  log(str);

  if (notifType === this.NOTIF_TYPE.schema) {
    if (this.onSchemaChange) {
      const [_, command, _event_type, query] = dataArr;

      if (query) {
        this.onSchemaChange({ command, query })
      }
    }

    return;
  }

  if (notifType !== this.NOTIF_TYPE.data) {
    console.error("Unexpected notif type: ", notifType);
    return;
  }

  if (dataArr.length < 3) {
    throw "notifListener: dataArr length < 3"
  }

  const [_, table_name, op_name, condition_ids_str] = dataArr;

  // const triggers = await this.db.any("SELECT * FROM prostgles.triggers WHERE table_name = $1 AND id IN ($2:csv)", [table_name, condition_ids_str.split(",").map(v => +v)]);
  // const conditions: string[] = triggers.map(t => t.condition);
  log("notifListener", dataArr.join("__"))

  /* Trigger error */
  if (
    condition_ids_str?.startsWith("error") &&
    this._triggers?.[table_name]?.length
  ) {
    const pref = "INTERNAL ERROR";
    console.error(`${pref}: condition_ids_str: ${condition_ids_str}`)
    this._triggers[table_name]!.map(c => {
      const subs = this.getSubs(table_name, c);
      subs.map(s => {
        this.pushSubData(s, pref + ". Check server logs. Schema might have changed");
      })
    });

    /* Trigger ok */
  } else if (
    condition_ids_str?.split(",").length &&
    condition_ids_str?.split(",").every((c: string) => Number.isInteger(+c)) &&
    this._triggers?.[table_name]?.length
  ) {


    const idxs = condition_ids_str.split(",").map(v => +v);
    const conditions = this._triggers[table_name]!.filter((c, i) => idxs.includes(i))

    log("notifListener", { table_name, op_name, condition_ids_str, conditions }, this._triggers[table_name]);

    conditions.map(condition => {

      const subs = this.getSubs(table_name, condition);
      const syncs = this.getSyncs(table_name, condition);

      log("notifListener", { table_name, condition, subs, syncs })

      syncs.map((s) => {
        this.syncData(s, undefined, "trigger");
      });

      /* Throttle the subscriptions */
      subs.forEach(sub => {
        sub.triggers.forEach(trg => {
          if (
            this.dbo[trg.table_name] &&
            sub.is_ready &&
            (sub.socket_id && this.sockets[sub.socket_id]) || sub.func
          ) {
            const throttle = sub.throttle || 0;
            if (sub.last_throttled <= Date.now() - throttle) {
  
              /* It is assumed the policy was checked before this point */
              this.pushSubData(sub);
              // sub.last_throttled = Date.now();
            } else if (!sub.is_throttling) {
  
  
              log("throttling sub")
              sub.is_throttling = setTimeout(() => {
                log("throttling finished. pushSubData...")
                sub.is_throttling = null;
                this.pushSubData(sub);
              }, throttle);// sub.throttle);
            }
          }
        });
      });

    });

    /* Trigger unknown issue */
  } else {

    // if(!this._triggers || !this._triggers[table_name] || !this._triggers[table_name].length){
    //     console.warn(190, "Trigger sub not found. DROPPING TRIGGER", table_name, condition_ids_str, this._triggers);
    //     this.dropTrigger(table_name);
    // } else {
    // }
    console.warn(190, "Trigger sub issue: ", table_name, condition_ids_str, this._triggers);
  }
}