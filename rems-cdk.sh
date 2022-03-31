#!/bin/zsh

set -o errexit

# we can fetch these settings however we want - depending on our security settings - feel free to replace
# with any technique that makes sense for you
# here are the REMS settings that are almost certainly going to need to change for
# each deployment (i.e the domain name).
# there are other REMS settings that you might like to change (REMS features etc) - for those
# see iac/rems-docker-image/config.edn

# the namespace must pre-exist as a CloudMap namespace in the account of deployment
# (we also have an annoying CDK bug that means we *also* have to specify the id - hopefully this
#  is fixed and we can just lookup by name)
CLOUDMAP_NAMESPACE=$(<rems-cloudmap-namespace.txt)
CLOUDMAP_ID="ns-mjt63c4ppdrly4jd"

# if your git is private and you don't mind this info leakage we could embed directly
# here are some commented out (non-working) examples of the content
# HOSTED_PREFIX="rems"
# HOSTED_ZONE_NAME="dev.umccr.org"
# HOSTED_ZONE_CERT="arn:aws:acm:ap-southeast-2:843407916570:certificate/fb543730-282d-46c9-8553-512d18cf5a6b"
# OIDC_METADATA_URL="https://accounts.google.com/.well-known/openid-configuration"
# OIDC_CLIENT_ID="(client id)"
# OIDC_CLIENT_SECRET="(client secret)"

# for public git, we choose to use parameter store
HOSTED_PREFIX="rems"
HOSTED_ZONE_NAME=$(aws ssm get-parameter --name "hosted_zone_name" --output text --query "Parameter.Value")
HOSTED_ZONE_CERT=$(aws ssm get-parameter --name "cert_apse2_arn" --output text --query "Parameter.Value")
OIDC_METADATA_URL=$(aws ssm get-parameter --name "/rems/auth0/oauth_metadata_url" --output text --query "Parameter.Value")
OIDC_CLIENT_ID=$(aws ssm get-parameter --name "/rems/auth0/oauth_client_id" --output text --query "Parameter.Value")
OIDC_CLIENT_SECRET=$(aws ssm get-parameter --name "/rems/auth0/oauth_client_secret" --output text --query "Parameter.Value")

# in the case of wanting a db cluster and two instances (across availability zones) - add
#    --context "highlyAvailable=yes"

(cd iac; npx cdk "$@" \
   --toolkit-stack-name CDKToolkitNew \
   --context "cloudMapNamespace=$CLOUDMAP_NAMESPACE" \
   --context "cloudMapId=$CLOUDMAP_ID" \
   --context "hostedPrefix=$HOSTED_PREFIX" \
   --context "hostedZoneName=$HOSTED_ZONE_NAME" \
   --context "hostedZoneCert=$HOSTED_ZONE_CERT" \
   --context "oidcMetadataUrl=$OIDC_METADATA_URL" \
   --context "oidcClientId=$OIDC_CLIENT_ID" \
   --context "oidcClientSecret=$OIDC_CLIENT_SECRET")
