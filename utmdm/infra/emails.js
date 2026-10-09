// TagFluent emails: Cognito asks this function for the subject and body of each email it
// sends (sign-up codes, new codes, password resets), so they carry the brand, not a bare code.
const LOGO = 'https://www.tagfluent.com/email/tagfluent-wordmark.png';
const SITE = 'https://www.tagfluent.com';

// subject, heading, what the code is for, how long it lasts
const COPY = {
  CustomMessage_SignUp: ['Confirm your email for TagFluent', 'Confirm your email', 'Enter this code on the TagFluent sign-up page to confirm your email address.', '24 hours'],
  CustomMessage_ResendCode: ['Your new TagFluent code', 'Here is a new code', 'Enter this code on the TagFluent sign-up page to confirm your email address.', '24 hours'],
  CustomMessage_ForgotPassword: ['Reset your TagFluent password', 'Reset your password', 'Enter this code on TagFluent to choose a new password.', '1 hour'],
  CustomMessage_UpdateUserAttribute: ['Confirm your new email for TagFluent', 'Confirm your new email', 'Enter this code in TagFluent to confirm your new email address.', '24 hours'],
  CustomMessage_VerifyUserAttribute: ['Confirm your email for TagFluent', 'Confirm your email', 'Enter this code in TagFluent to confirm your email address.', '24 hours'],
};

const page = (heading, text, code, lasts) =>
  '<div style="background:#f4f2f7;padding:32px 12px;font-family:Helvetica,Arial,sans-serif">' +
  '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:14px;border-collapse:separate;overflow:hidden">' +
  '<tr><td style="background:#2a1a3f;padding:22px 28px"><a href="' + SITE + '"><img src="' + LOGO + '" width="146" height="38" alt="TagFluent" style="display:block;border:0;color:#f4eefb;font-family:Georgia,serif;font-size:26px"></a></td></tr>' +
  '<tr><td style="padding:30px 28px 10px;color:#231a2e">' +
  '<h1 style="margin:0 0 10px;font-family:Georgia,\'Times New Roman\',serif;font-weight:normal;font-size:28px;line-height:1.15;color:#231a2e">' + heading + '</h1>' +
  '<p style="margin:0 0 22px;font-size:15px;line-height:1.55;color:#5a5266">' + text + '</p>' +
  '<div style="font-family:Menlo,Consolas,monospace;font-size:32px;letter-spacing:8px;font-weight:bold;color:#231a2e;background:#e4f8ee;border-radius:10px;padding:16px 18px;text-align:center">' + code + '</div>' +
  '<p style="margin:22px 0 0;font-size:13px;line-height:1.55;color:#756d82">The code works for ' + lasts + '. If you didn\'t ask for it, you can ignore this email; nothing changes without the code.</p>' +
  '</td></tr>' +
  '<tr><td style="padding:22px 28px 26px"><p style="margin:0;padding-top:16px;border-top:1px solid #e3deea;font-size:12px;line-height:1.5;color:#756d82">' +
  'TagFluent &middot; Your marketing source of truth &middot; <a href="' + SITE + '" style="color:#3b2557">tagfluent.com</a></p></td></tr>' +
  '</table></div>';

exports.handler = async (event) => {
  const copy = COPY[event.triggerSource];
  if (!copy) return event; // anything else keeps Cognito's own message
  const [subject, heading, text, lasts] = copy;
  event.response.emailSubject = subject;
  event.response.emailMessage = page(heading, text, event.request.codeParameter, lasts);
  return event;
};
