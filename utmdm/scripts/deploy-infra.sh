#!/usr/bin/env bash
# Deploys TagFluent's backend (Cognito, DynamoDB, the API, demo requests) and hands its addresses to the
# Amplify app as environment variables. The site itself deploys on every push to main.
# Run from the repo root, signed in to the AWS CLI:   scripts/deploy-infra.sh <amplify-app-id>
set -euo pipefail
cd "$(dirname "$0")/.."

APP_ID="${1:?usage: scripts/deploy-infra.sh <amplify-app-id>}"
PROFILE="${AWS_PROFILE:-utmdm}"
REGION="${AWS_REGION:-us-east-2}"
STACK="${STACK:-utmdm}"
aws() { command aws --profile "$PROFILE" --region "$REGION" "$@"; }
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

ORIGIN="https://main.$(aws amplify get-app --app-id "$APP_ID" --query app.defaultDomain --output text)"
echo "→ Backend ($STACK in $REGION) for $ORIGIN"
python3 - "$work/template.yaml" <<'PY'
import sys
template = open('infra/template.yaml').read()
for name, marker in (('infra/api.js', '__API_CODE__'), ('infra/demo.js', '__DEMO_CODE__'), ('infra/approve.js', '__APPROVE_CODE__'), ('infra/emails.js', '__EMAILS_CODE__')):
    code = open(name).read()
    assert len(code) <= 4096, f'{name} must stay under 4096 characters to inline in CloudFormation'
    block = '|\n' + ''.join('          ' + line + '\n' if line.strip() else '\n' for line in code.splitlines())
    template = template.replace(marker, block.rstrip('\n'))
open(sys.argv[1], 'w').write(template)
PY
aws cloudformation deploy --stack-name "$STACK" --template-file "$work/template.yaml" \
  --parameter-overrides "AppOrigin=$ORIGIN" --capabilities CAPABILITY_IAM --no-fail-on-empty-changeset

output() { aws cloudformation describe-stacks --stack-name "$STACK" --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text; }
echo "→ Amplify app $APP_ID environment"
aws amplify update-app --app-id "$APP_ID" --environment-variables \
  "UTMDM_REGION=$REGION,UTMDM_API_URL=$(output ApiUrl),UTMDM_CLIENT_ID=$(output ClientId)" >/dev/null
echo "Done. The next push to main (or a redeploy in Amplify) builds with these settings."
