// firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyC9PXofxgucm5TtVXg80U1s1-0360YpFh4",
  authDomain: "cyprus-match-preding.firebaseapp.com",
  projectId: "cyprus-match-preding",
  storageBucket: "cyprus-match-preding.appspot.com",
  messagingSenderId: "221152464909",
  appId: "1:221152464909:web:270845eba7c4cc00fc544"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
