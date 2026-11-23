/**
 * Types minimaux du runtime Softr, pour `npm run softr:typecheck`. Le vrai
 * module est fourni par Softr au moment de la compilation du bloc.
 */
declare module '@/lib/datasource' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Any = any;
  export const datasource: { define<T extends Record<string, string>>(map: T): { [K in keyof T]: Any } };
  export const q: Any;
  export function useRecords(options: Any): Any;
  export function useRecordUpdate(options: Any): Any;
  export function useRecordCreate(options: Any): Any;
  export function useRecordDelete(options: Any): Any;
}

declare module 'virtual:css-app' {
  export const CSS_APP: string;
}

declare module '@/lib/user' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function useCurrentUser(options?: any): any;
}
