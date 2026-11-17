// Demo start (`npm run dev`): a fresh marketplace in demoläge before the app starts.
import { closeDb } from "../src/db/client";
import { resetDemoDatabase } from "../src/db/seed";
import { systemClock } from "../src/domain/clock";
import { databasePath } from "../src/server/database-path";

const file = databasePath();
closeDb(resetDemoDatabase(file, systemClock));
process.stdout.write(`Demoläge: databasen ${file} är nollställd och förifylld.\n`);
