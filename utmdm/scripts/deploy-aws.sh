#!/usr/bin/env bash
# Deploys UTMDM to AWS: the CloudFormation stack (Amplify app, Cognito, DynamoDB, API),
# then the built site to Amplify Hosting. Run from utmdm/:  scripts/deploy-aws.sh
# Needs the AWS CLI signed in (aws login --profile utmdm). Override with AWS_PROFILE / AWS_REGION / STACK.
set -euo pipefail
cd "$(dirname "$0")/.."

PROFILE="${AWS_PROFILE:-utmdm}"
REGION="${AWS_REGION:-us-east-2}"
STACK="${STACK:-utmdm}"
aws() { command aws --profile "$PROFILE" --region "$REGION" "$@"; }
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

echo "→ Infrastructure ($STACK in $REGION)"
python3 - "$work/template.yaml" <<'PY'
import sys, json
code = open('infra/api.js').read()
assert len(code) <= 4096, 'infra/api.js must stay under 4096 characters to inline in CloudFormation'
template = open('infra/template.yaml').read()
block = '|\n' + ''.join('          ' + line + '\n' if line.strip() else '\n' for line in code.splitlines())
open(sys.argv[1], 'w').write(template.replace('__API_CODE__', block.rstrip('\n')))
PY
aws cloudformation deploy --stack-name "$STACK" --template-file "$work/template.yaml" \
  --capabilities CAPABILITY_IAM --no-fail-on-empty-changeset

output() { aws cloudformation describe-stacks --stack-name "$STACK" --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text; }
APP_ID="$(output AppId)"
APP_URL="$(output AppUrl)"

echo "→ Site"
npm run build
cat > dist/config.json <<JSON
{
  "region": "$REGION",
  "apiUrl": "$(output ApiUrl)",
  "authDomain": "$(output AuthDomain)",
  "clientId": "$(output ClientId)"
}
JSON
(cd dist && zip -qr "$work/site.zip" .)

echo "→ Upload to Amplify ($APP_ID)"
read -r JOB_ID UPLOAD_URL < <(aws amplify create-deployment --app-id "$APP_ID" --branch-name main --query '[jobId, zipUploadUrl]' --output text)
curl -sSf -X PUT -H 'Content-Type: application/zip' --upload-file "$work/site.zip" "$UPLOAD_URL" >/dev/null
aws amplify start-deployment --app-id "$APP_ID" --branch-name main --job-id "$JOB_ID" >/dev/null
for _ in $(seq 1 60); do
  STATUS="$(aws amplify get-job --app-id "$APP_ID" --branch-name main --job-id "$JOB_ID" --query 'job.summary.status' --output text)"
  [ "$STATUS" = "SUCCEED" ] || [ "$STATUS" = "FAILED" ] || [ "$STATUS" = "CANCELLED" ] && break
  sleep 5
done
echo "Deployment $JOB_ID: $STATUS"
[ "$STATUS" = "SUCCEED" ]
echo "UTMDM is live at $APP_URL"
