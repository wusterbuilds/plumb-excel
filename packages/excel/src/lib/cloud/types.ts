export interface ConnectorInfo {
  id: string;
  name: string;
  description: string;
  authType: "oauth" | "credentials" | "apikey";
  authFields: AuthField[];
  tools: string[];
  status: "available" | "coming_soon" | "beta";
}

export interface AuthField {
  name: string;
  label: string;
  type: "text" | "password" | "email";
  placeholder?: string;
}

export interface ConnectedSource {
  connectorId: string;
  connectionId: string;
  displayName: string;
  connectedAt: number;
  enabled: boolean;
}
