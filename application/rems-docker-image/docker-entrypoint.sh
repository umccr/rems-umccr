#!/bin/bash

SM_SETTINGS="RemsPrivateSettings"

# bring down various "private" environment settings like OIDC client etc
# the use of eval (somewhat dangerous) here is mitigated by the fact the content must be valid JSON (to satisfy jq) and
# that control over the secret in AWS is an admin level operation
eval "export $(aws secretsmanager get-secret-value --secret-id $SM_SETTINGS --query SecretString --output text | jq -r 'to_entries | map("\(.key)=\(.value)") | @sh')"

# one of the env settings is the content of a JWK generated at https://mkjwk.org/
# we turn that into pub/private keys on the filesystem
jq -n  'env.VISA_PRIVATE_KEY | fromjson' > /rems/private-key.jwk
jq -n  'env.VISA_PRIVATE_KEY | fromjson | {kty,e,use,kid,alg,n}' > /rems/public-key.jwk

unset VISA_PRIVATE_KEY

cmd_prefix=""
cmd=""
declare -a cmd_array

if [ "${CMD}" ] ; then
  IFS=';' read -r -a cmd_array <<< "${CMD}"
elif [ "${COMMANDS}" ] ; then
  IFS=' ' read -r -a cmd_array <<< "${COMMANDS}"
else
  # we choose to always migrate before running when given no other commands
  # this helps us with the initial bootstrap of the service
  cmd_array=("migrate" "run")
fi

for cmd in "${cmd_array[@]}"
do
    [ "${cmd}" = "run" ] && cmd_prefix="exec"

    FULL_COMMAND="${cmd_prefix} java -Dlogback.configurationFile=/rems/logback.xml -Drems.config=config.edn -jar rems.jar ${cmd}"
    echo "####################"
    echo "########## RUNNING COMMAND: ${FULL_COMMAND}"
    echo "####################"
    ${FULL_COMMAND}
done

echo "####################"
echo "########## CONTAINER STARTUP FINISHED"
echo "####################"
