import { DatabaseNotice } from "law-office-mvp";

export const NotReady = () => <DatabaseNotice databaseReady={false} />;

export const WithError = () => (
  <DatabaseNotice
    databaseReady={false}
    error='connect ECONNREFUSED 127.0.0.1:5432'
  />
);
