import { MySqlAdapter } from "./mysql.js";
import { PostgresAdapter } from "./postgres.js";
import { TdengineAdapter } from "./tdengine.js";
const adapters = {
    postgres: new PostgresAdapter(),
    mysql: new MySqlAdapter(),
    tdengine: new TdengineAdapter(),
};
export function getAdapter(type) {
    return adapters[type];
}
