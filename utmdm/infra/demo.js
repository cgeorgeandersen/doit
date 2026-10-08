// TagFluent demo requests: the home page's "Book a demo" form posts here (no sign-in),
// and each valid request is emailed through an SNS topic.
const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');
const sns = new SNSClient({});
const out = (statusCode, body) => ({ statusCode, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const clean = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, max);

exports.handler = async (e) => {
  let b;
  try {
    b = JSON.parse(e.isBase64Encoded ? Buffer.from(e.body || '', 'base64').toString() : e.body || '{}');
  } catch {
    return out(400, { error: 'not json' });
  }
  if (b.website) return out(200, { ok: true }); // the hidden field people leave empty
  const r = {
    name: clean(b.name, 100),
    email: clean(b.email, 200),
    company: clean(b.company, 120),
    role: clean(b.role, 60),
    message: clean(b.message, 2000),
  };
  if (!r.name || !r.company || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email)) return out(400, { error: 'name, email and company are required' });
  const when = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  await sns.send(new PublishCommand({
    TopicArn: process.env.TOPIC,
    Subject: ('TagFluent demo request: ' + r.company).replace(/[^\x20-\x7e]/g, '').slice(0, 99),
    Message: [
      'New demo request from the TagFluent home page.',
      '',
      'Name:     ' + r.name,
      'Email:    ' + r.email,
      'Company:  ' + r.company,
      'Team:     ' + (r.role || '-'),
      'Sent:     ' + when,
      '',
      'What they want to see:',
      r.message || '(nothing added)',
    ].join('\n'),
  }));
  return out(200, { ok: true });
};
