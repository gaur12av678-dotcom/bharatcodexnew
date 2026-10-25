import { createContext, useContext, useEffect, useState } from 'react'
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth'
import { doc, getDoc, setDoc, runTransaction } from 'firebase/firestore'
import { auth, db, googleProvider } from '../firebase/config'

const AuthContext = createContext(null)
export const useAuth = () => useContext(AuthContext)

// RULE: Jo pehla sign in karega, wahi ADMIN banega.
// meta/app doc race-safe transaction se handle hota hai —
// do log ek saath first-time aaye tab bhi sirf ek hi admin banega.
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
      if (!adminAssigned) {
        tx.set(configRef, { adminAssigned: true, adminUid: user.uid }, { merge: true })
      }
    })
    return { role }
  } catch (e) {
    // Race case: kisi aur ne pehle admin bana liya
    const again = await getDoc(userRef)
    if (again.exists()) return again.data()
    throw e
  }
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)       // Firebase auth user
  const [profile, setProfile] = useState(null) // Firestore user doc
  const [loading, setLoading] = useState(true)

  useEffect(() => {
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
    await signInWithPopup(auth, googleProvider)
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
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
