// TagFluent API: each signed-in user's tables, each stored as one DynamoDB item per change.
// A table's items: pk = USER#<cognito sub> for the first table ("main", where the
// only table used to live) or USER#<sub>#<table id> for the others; sk = META (name,
// user) or C#<version, zero-padded>. The list of a user's tables: pk = TABLES#<sub>,
// sk = <table id>, with the table's name and when it was made.
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand, PutCommand, BatchWriteCommand } = require('@aws-sdk/lib-dynamodb');
const db = DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } });
const T = process.env.TABLE;
// How many tables one account may have. The pricing plans will set this per account.
const MAX_TABLES = Number(process.env.MAX_TABLES) || 25;
const MAIN = 'main';
const out = (statusCode, body) => ({ statusCode, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const sk = (v) => 'C#' + String(v).padStart(8, '0');

async function items(pk, onlySk) {
  const all = [];
  let ExclusiveStartKey;
  do {
    const r = await db.send(new QueryCommand({
      TableName: T,
      KeyConditionExpression: onlySk ? 'pk = :p AND sk = :s' : 'pk = :p',
      ExpressionAttributeValues: onlySk ? { ':p': pk, ':s': onlySk } : { ':p': pk },
      ExclusiveStartKey,
    }));
    all.push(...r.Items);
    ExclusiveStartKey = r.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return all;
}

async function batch(requests) {
  for (let i = 0; i < requests.length; i += 25) {
    let left = { [T]: requests.slice(i, i + 25) };
    while (left[T] && left[T].length) left = (await db.send(new BatchWriteCommand({ RequestItems: left }))).UnprocessedItems || {};
  }
}

exports.handler = async (e) => {
  const sub = e.requestContext.authorizer.jwt.claims.sub;
  const table = (e.queryStringParameters && e.queryStringParameters.table) || MAIN;
  if (!/^[a-z0-9]{1,24}$/.test(table)) return out(400, { error: 'bad table id' });
  const pk = table === MAIN ? 'USER#' + sub : 'USER#' + sub + '#' + table;
  const listPk = 'TABLES#' + sub;
  const body = e.body ? JSON.parse(e.isBase64Encoded ? Buffer.from(e.body, 'base64').toString() : e.body) : {};
  const meta = (m) => ({ PutRequest: { Item: { pk, sk: 'META', schema: m.schema, name: m.name, user: m.user } } });

  // The user's tables, oldest first. The first table predates this list, so it joins it the first time it's read.
  async function tables() {
    const listed = await items(listPk);
    if (!listed.some((t) => t.sk === MAIN)) {
      const [m] = await items('USER#' + sub, 'META');
      if (m) {
        const first = { pk: listPk, sk: MAIN, name: m.name, created: '0' };
        await db.send(new PutCommand({ TableName: T, Item: first }));
        listed.push(first);
      }
    }
    return listed.sort((a, b) => String(a.created).localeCompare(String(b.created)));
  }

  // Keeps the table's name in the list, and refuses a new table past the limit.
  async function list(name) {
    const all = await tables();
    const known = all.find((t) => t.sk === table);
    if (!known && all.length >= MAX_TABLES) return false;
    if (!known || known.name !== name) {
      await db.send(new PutCommand({ TableName: T, Item: { pk: listPk, sk: table, name, created: known ? known.created : new Date().toISOString() } }));
    }
    return true;
  }
  const full = () => out(403, { error: 'table limit', limit: MAX_TABLES });

  if (e.routeKey === 'GET /workspace') {
    const all = await items(pk);
    const m = all.find((i) => i.sk === 'META');
    const workspace = m ? { schema: m.schema, name: m.name, user: m.user, changes: all.filter((i) => i.sk.startsWith('C#')).map((i) => i.change) } : null;
    const listed = (await tables()).map((t) => ({ id: t.sk, name: t.name }));
    return out(200, { workspace, tables: listed, limit: MAX_TABLES });
  }

  // Append new versions. A version that already exists means someone else saved first.
  if (e.routeKey === 'POST /workspace/changes') {
    if (!(await list(body.name))) return full();
    await batch([meta(body)]);
    for (const change of body.changes || []) {
      try {
        await db.send(new PutCommand({ TableName: T, Item: { pk, sk: sk(change.version), change }, ConditionExpression: 'attribute_not_exists(sk)' }));
      } catch (err) {
        if (err.name === 'ConditionalCheckFailedException') return out(409, { error: 'version taken', version: change.version });
        throw err;
      }
    }
    return out(200, { saved: (body.changes || []).length });
  }

  // Replace the whole table: a new table, a restored backup, or the sample started over.
  if (e.routeKey === 'PUT /workspace') {
    if (!(await list(body.name))) return full();
    const old = await items(pk);
    await batch(old.map((i) => ({ DeleteRequest: { Key: { pk, sk: i.sk } } })));
    await batch([meta(body), ...(body.changes || []).map((change) => ({ PutRequest: { Item: { pk, sk: sk(change.version), change } } }))]);
    return out(200, { saved: (body.changes || []).length });
  }

  // Delete a table and everything in it. The last table stays, so there's always one to open.
  if (e.routeKey === 'DELETE /workspace') {
    const all = await tables();
    if (!all.some((t) => t.sk === table)) return out(404, { error: 'no such table' });
    if (all.length <= 1) return out(409, { error: 'last table' });
    const old = await items(pk);
    await batch([...old.map((i) => ({ DeleteRequest: { Key: { pk, sk: i.sk } } })), { DeleteRequest: { Key: { pk: listPk, sk: table } } }]);
    return out(200, { deleted: table });
  }

  return out(404, { error: 'not found' });
};
