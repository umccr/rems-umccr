import createConnectionPool, { sql, IsolationLevel } from "@databases/pg";
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
import { ECSClient, RunTaskCommand } from "@aws-sdk/client-ecs";

/*
{
                "cluster": event['detail']['clusterArn'].split('/')[1],
                "subnets": subnets,
                "cpu": event['detail']['cpu'],
                "memory": event['detail']['memory'],
                "command": overrides['command'],
                "environment": overrides['environment'],
                "container_name": container_info['name'],
                "reference_id": f"{container_info['taskArn'].split('/')[1]}-{randrange(10)}",
                "task_def": event['detail']['taskDefinitionArn'].split('/')[1].split(':')[0],
                "startedBy": "CloudWatch Rules State Change to STOPPED",
                "security_groups": [os.environ['ECS_SECURITY_GROUP']]
            }
 */
export const handler = async (event) => {
  try {
    const secretName = event.secretName;

    if (!secretName)
      throw new Error(
        "Lambda event must contain a 'secretName' stating the secret with RDS password"
      );

    // we have a secret that we use for our rems databases
    const secretsManager = new SecretsManagerClient({});
    const secretValue = await secretsManager.send(
      new GetSecretValueCommand({ SecretId: event.secretName })
    );
    const secret = secretValue.SecretString;

    if (secret) {
      // note that the only way that this works is if the env variable DATABASE_URL has
      // been filled in with a connection to the master db - this will then be automatically
      // picked up by the connection pooling
      const db = createConnectionPool();

      // construct a 'user' rems and give it the password we share with the postgres user
      await db.query(sql`
                        DO $$
                        BEGIN
                        CREATE USER rems;
                        EXCEPTION WHEN duplicate_object THEN RAISE NOTICE '%, skipping', SQLERRM USING ERRCODE = SQLSTATE;
                        END
                        $$`);

      await db.query(
        sql.__dangerous__rawValue(`ALTER ROLE rems WITH PASSWORD '${secret}'`)
      );

      const dbExists = await db.query(
        sql`SELECT datname FROM pg_catalog.pg_database WHERE datname=${"rems"}`
      );

      if (dbExists.length === 0) {
        // temporarily grant postgres the rems role - in order to allow a db to be created owned by rems
        // (this is an AWS RDS quirk due to 'postgres' not actually  being a real superuser)
        await db.query(sql`GRANT rems TO postgres`);
        await db.query(sql`CREATE DATABASE rems OWNER rems`);
        await db.query(sql`REVOKE rems FROM postgres`);

        return {
          status: "OK DB CREATED",
        };
      } else {
        return {
          status: "OK DB ALREADY EXISTS",
        };
      }
    } else {
      throw new Error(
        `Missing secret string from secret '${event.secretName}'`
      );
    }
  } catch (err) {
    return {
      status: "ERROR",
      message: err.message,
    };
  }
};
