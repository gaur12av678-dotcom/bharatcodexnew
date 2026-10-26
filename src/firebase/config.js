import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, GithubAuthProvider } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

// BharatCodex Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyCD4MliIJMs770o8lj4T4QdGNYtOzGyEQc",
  authDomain: "bharatcodex-4a046.firebaseapp.com",
  databaseURL: "https://bharatcodex-4a046-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "bharatcodex-4a046",
  storageBucket: "bharatcodex-4a046.firebasestorage.app",
  messagingSenderId: "795024410918",
  appId: "1:795024410918:web:e18984b74d38a7cd7f59e7"
}

const app = initializeApp(firebaseConfig)

export const auth = getAuth(app)
export const db = getFirestore(app)
export const googleProvider = new GoogleAuthProvider()
export const githubProvider = new GithubAuthProvider()
githubProvider.addScope('read:user')
githubProvider.addScope('user:email')
