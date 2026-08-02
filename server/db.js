/* DB pool: Postgres thật (Render) hoặc pg-mem khi chạy local không có DATABASE_URL. */
'use strict';
const fs = require('fs');
const path = require('path');

let pool;
let memDb = null;

function initDb() {
  if (pool) return pool;
  if (process.env.DATABASE_URL) {
    const { Pool } = require('pg');
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_SSL === 'false'
        ? false
        : { rejectUnauthorized: false },
    });
  } else {
    const { newDb } = require('pg-mem');
    memDb = newDb();
    const memPg = memDb.adapters.createPg();
    pool = new memPg.Pool();
  }
  return pool;
}

async function ensureSchema() {
  const p = initDb();
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await p.query(sql);
}

function getMemDb() {
  return memDb;
}

module.exports = { initDb, ensureSchema, getMemDb };
