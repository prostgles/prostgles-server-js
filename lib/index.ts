import { Prostgles, ProstglesInitOptions } from "./Prostgles";
import { TableHandler, ViewHandler } from "./DboBuilder";

function prostgles(params: ProstglesInitOptions){

    let prgl = new Prostgles(params);
    return prgl.init(params.onReady);
}


// declare const init (params: InitOptions) => {
//     let prgl = new Prostgles(params);
//     prgl.init(params.isReady);
// }

export = prostgles;//{ , TableHandler, ViewHandler };




// module.exports = {
//     pgp,
//     init,
//     Prostgles
// }
// module.exports = prostgles;

// module.exports = init;
// declare module "ProstglesServer" {
//     function iinit(params: InitOptions): void ;
//     // namespace iinit {
//     //     interface ReduxLoggerOptions {
//     //       actionTransformer?: (action: any) => any;
//     //       collapsed?: boolean;
//     //       duration?: boolean;
//     //       level?: string;
//     //       logger?: any;
//     //       predicate?: (getState: Function, action: any) => boolean;
//     //       timestamp?: boolean;
//     //       transformer?: (state:any) => any;
//     //     }
//     //   }
//     export = iinit;
//     // export = init;
// }


//var init =

// export function init(params: InitOptions){

//     let prgl = new Prostgles(params);
//     prgl.init(params.isReady);
// }

// declare const init (params: InitOptions) => {
//         let prgl = new Prostgles(params);
//         prgl.init(params.isReady);
// }

// export = init;