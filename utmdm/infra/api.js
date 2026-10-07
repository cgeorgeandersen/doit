// UTMDM API: each signed-in user's workspace, stored as one DynamoDB item per change.
// pk = USER#<cognito sub>; sk = META (name, user) or C#<version, zero-padded>.
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand, PutCommand, BatchWriteCommand } = require('@aws-sdk/lib-dynamodb');
const db = DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } });
const T = process.env.TABLE;
const out = (statusCode, body) => ({ statusCode, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const sk = (v) => 'C#' + String(v).padStart(8, '0');

async function items(pk) {
  const all = [];
  let ExclusiveStartKey;
  do {
    const r = await db.send(new QueryCommand({ TableName: T, KeyConditionExpression: 'pk = :p', ExpressionAttributeValues: { ':p': pk }, ExclusiveStartKey }));
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
  const pk = 'USER#' + e.requestContext.authorizer.jwt.claims.sub;
  const body = e.body ? JSON.parse(e.isBase64Encoded ? Buffer.from(e.body, 'base64').toString() : e.body) : {};
  const meta = (m) => ({ PutRequest: { Item: { pk, sk: 'META', schema: m.schema, name: m.name, user: m.user } } });

  if (e.routeKey === 'GET /workspace') {
    const all = await items(pk);
    const m = all.find((i) => i.sk === 'META');
    if (!m) return out(200, { workspace: null });
    const changes = all.filter((i) => i.sk.startsWith('C#')).map((i) => i.change);
    return out(200, { workspace: { schema: m.schema, name: m.name, user: m.user, changes } });
  }

  // Append new versions. A version that already exists means someone else saved first.
  if (e.routeKey === 'POST /workspace/changes') {
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

  // Replace the whole workspace: a restored backup, or the demo started over.
  if (e.routeKey === 'PUT /workspace') {
    const old = await items(pk);
    await batch(old.map((i) => ({ DeleteRequest: { Key: { pk, sk: i.sk } } })));
    await batch([meta(body), ...(body.changes || []).map((change) => ({ PutRequest: { Item: { pk, sk: sk(change.version), change } } }))]);
    return out(200, { saved: (body.changes || []).length });
  }

  return out(404, { error: 'not found' });
};
