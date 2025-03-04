export interface RemsSettings {
  /**
   * If present and true, indicates to resources that they should use values suitable for a development
   * deployment (i.e. no deletion protection, short time frames for expiry etc)
   */
  readonly isDevelopment?: boolean;

  /**
   * The namespace we will register services in - for location by our rems-cmd tool
   */
  readonly cloudMapNamespace: string;

  /**
   * The id of the above namespace
   */
  readonly cloudMapId: string;

  /**
   * The service name for registering in cloudmap (can be used to distinguish between multiple REMS
   * in the same namespace). Would normally be "rems".
   */
  readonly cloudMapServiceName: string;

  /**
   * The host name prefix (name before first dot in hostname)
   */
  readonly hostedPrefix: string;

  /**
   * The email address to use in the from address of REMS sent emails.
   */
  readonly smtpMailFrom: string;

  /**
   * The memory assigned to the service
   */
  readonly memoryLimitMiB: number;

  /**
   * The cpu assigned to the service
   */
  readonly cpu: number;
}
