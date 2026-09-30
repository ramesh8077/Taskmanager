export interface RbacUser {
  id: number;
  role: string;
  permissions: readonly string[];
}

export interface RbacResource {
  [key: string]: unknown;
  project?: {
    createdBy?: number | string | null;
    ownerId?: number | string | null;
  };
}

export function normalizedRole(role: string): string;
export function can(
  user: RbacUser | null | undefined,
  permission: string,
  resource?: RbacResource
): boolean;
