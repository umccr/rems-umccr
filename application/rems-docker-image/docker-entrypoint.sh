#!/bin/bash

# bring down GA4GH visa keys from secrets manager
aws secretsmanager get-secret-value --secret-id RemsVisaJwk --query SecretString --output text > /rems/private-key.jwk
jq < /rems/private-key.jwk '{kty,e,use,kid,alg,n}' > /rems/public-key.jwk

cmd_prefix=""
cmd=""
declare -a cmd_array

if [ "${CMD}" ] ; then
  IFS=';' read -r -a cmd_array <<< "${CMD}"
elif [ "${COMMANDS}" ] ; then
  IFS=' ' read -r -a cmd_array <<< "${COMMANDS}"
else
  cmd_array=("run")
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
