import { createContext, useContext } from 'react';

/**
 * @typedef {Object} AuthState
 * @property {'loading'|'authenticated'|'anonymous'} status
 * @property {null|{id:string,name:string,email:string,role:string,isEmailVerified:boolean}} user
 * @property {(credentials:{email:string,password:string}) => Promise<void>} signIn
 * @property {() => Promise<void>} signOut
 * @property {() => Promise<void>} reloadUser
 */

export const AuthContext = createContext(null);

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}
