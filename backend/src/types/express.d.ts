import 'express';
declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: number;
        organizationPk: number;
        organizationId: string;
        email: string;
        role: 'SUPER_ADMIN' | 'INVENTORY_MANAGER' | 'ACCOUNT_MANAGER';
        databaseName: string;
      };
    }
  }
}
export {};
