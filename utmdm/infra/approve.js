// TagFluent account approval: Cognito runs this once a new user confirms their email.
// It disables the account until the owner enables it in the Cognito console, and
// emails the owner (through the demo-requests topic) that someone is waiting.
const { CognitoIdentityProviderClient, AdminDisableUserCommand } = require('@aws-sdk/client-cognito-identity-provider');
const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');
const idp = new CognitoIdentityProviderClient({});
const sns = new SNSClient({});

exports.handler = async (event) => {
  if (event.triggerSource !== 'PostConfirmation_ConfirmSignUp') return event;
  // Fail closed: if this throws, the confirmation fails and the account stays unusable.
  await idp.send(new AdminDisableUserCommand({ UserPoolId: event.userPoolId, Username: event.userName }));
  const email = (event.request.userAttributes || {}).email || event.userName;
  const users = 'https://' + process.env.AWS_REGION + '.console.aws.amazon.com/cognito/v2/idp/user-pools/' + event.userPoolId + '/user-management/users';
  try {
    await sns.send(new PublishCommand({
      TopicArn: process.env.TOPIC,
      Subject: 'TagFluent: new account waiting for approval',
      Message: [
        email + ' created a TagFluent account and confirmed their email.',
        'The account is disabled until you approve it.',
        '',
        'To approve: open the Cognito users list, select ' + email + ', then Actions > Enable user access.',
        users,
        '',
        'They are not told when you approve, so send them a note when it is done.',
      ].join('\n'),
    }));
  } catch (err) {
    console.error('notify failed', err); // the account is already disabled; the note is a convenience
  }
  return event;
};
