import { MongoClient } from "mongodb";

import { config } from "./core/config.js";
import { createMongoJobStore, pumpJobs } from "./modules/rag/job-pump.js";
import { createRagService } from "./modules/rag/rag-service.js";

const client = new MongoClient(config.mongo.url);
await client.connect();
const store = createMongoJobStore(client.db().collection("embedJobs"));
const rag = createRagService({ storeKind: config.rag.store, externalJobs: store });
const finished = await pumpJobs(store, (job) => rag.runQueued(job.id ?? job._id));
console.log(JSON.stringify({ finished }));
await client.close();
