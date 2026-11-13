import { createContext, useContext, useEffect, useState } from 'react'
import { onAuthStateChanged, signInWithRedirect, signOut, GithubAuthProvider, getRedirectResult } from 'firebase/auth'
import { doc, getDoc, setDoc, runTransaction } from 'firebase/firestore'
import { auth, db, googleProvider, githubProvider } from '../firebase/config'
import { rememberGitHubToken } from '../services/githubService'

const AuthContext = createContext(null)
export const useAuth = () => useContext(AuthContext)

// RULE: Jo pehla sign in karega, wahi ADMIN banega.
// meta/app doc race-safe transaction se handle hota hai.
const ensureUserDoc = async (user) => {
  const userRef = doc(db, 'users', user.uid)
  const snap = await getDoc(userRef)
  if (snap.exists()) return snap.data()

  const configRef = doc(db, 'meta', 'app')
  try {
    let role = 'member'
    await runTransaction(db, async (tx) => {
      const cfgSnap = await tx.get(configRef)
      const adminAssigned = cfgSnap.exists() && cfgSnap.data().adminAssigned === true
      role = adminAssigned ? 'member' : 'admin'
      tx.set(userRef, {
        name: user.displayName || 'User',
        email: user.email || '',
        photoURL: user.photoURL || '',
        role,
        createdAt: Date.now(),
      })
      if (!adminAssigned) tx.set(configRef, { adminAssigned: true, adminUid: user.uid }, { merge: true })
    })
    return { role }
  } catch (e) {
    const again = await getDoc(userRef)
    if (again.exists()) return again.data()
    throw e
  }
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Redirect-based OAuth popup isolation ke saath compatible hai.
    getRedirectResult(auth).then((result) => {
      if (!result) return
      const token = GithubAuthProvider.credentialFromResult(result)?.accessToken
      if (token) {
        let scope = 'basic'
        try {
          scope = sessionStorage.getItem('bc_gh_requested_scope') === 'repo' ? 'repo' : 'basic'
          sessionStorage.removeItem('bc_gh_requested_scope')
        } catch {}
        rememberGitHubToken(token, scope)
      }
    }).catch((error) => console.error('OAuth redirect result failed:', error))

    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u)
      if (u) {
        try {
          const data = await ensureUserDoc(u)
          setProfile({ uid: u.uid, ...data })
        } catch (e) {
          console.error('User doc error:', e)
        }
      } else {
        setProfile(null)
      }
      setLoading(false)
    })
    return unsub
  }, [])

  const signInWithGoogle = async () => {
    await signInWithRedirect(auth, googleProvider)
  }

  const signInWithGitHub = async () => {
    await signInWithRedirect(auth, githubProvider)
  }

  const logout = () => signOut(auth)

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        isAdmin: profile?.role === 'admin',
        isTeam: profile?.role === 'team',
        signInWithGoogle,
        signInWithGitHub,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
