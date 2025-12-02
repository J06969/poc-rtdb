# Deployment Guide

## 🚀 Cloudflare Pages Deployment

Your code is now on GitHub: https://github.com/J06969/poc-rtdb

### Step 1: Connect to Cloudflare Pages

1. Go to **[Cloudflare Dashboard](https://dash.cloudflare.com/)**
2. Navigate to **Workers & Pages** → **Create application** → **Pages**
3. Click **Connect to Git**

### Step 2: Connect GitHub Repository

1. Click **Connect GitHub**
2. Authorize Cloudflare Pages
3. Select repository: **`J06969/poc-rtdb`**
4. Click **Begin setup**

### Step 3: Configure Build Settings

Use these **exact settings**:

| Setting | Value |
|---------|-------|
| **Project name** | `poc-rtdb` (or your choice) |
| **Production branch** | `master` |
| **Framework preset** | `Vite` |
| **Build command** | `npm run build` |
| **Build output directory** | `dist` |
| **Root directory** | `/` |

### Step 4: Environment Variables

**CRITICAL**: Add your Firebase configuration as environment variables:

1. Click **Environment variables** (advanced)
2. Add these variables (get values from Firebase Console → Project Settings):

```
VITE_FIREBASE_API_KEY=your_api_key_here
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_DATABASE_URL=https://your_project.firebaseio.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

**Note**: Check your current Firebase config in `src/config/firebase.js` to see what variables you need.

### Step 5: Deploy!

1. Click **Save and Deploy**
2. Wait for build to complete (~2-3 minutes)
3. Your app will be live at: `https://poc-rtdb.pages.dev`

---

## 🔄 Alternative: Using Wrangler CLI

If you prefer command-line deployment:

```bash
# Install Wrangler
npm install -g wrangler

# Login to Cloudflare
npx wrangler login

# Build your project
npm run build

# Deploy to Cloudflare Pages
npx wrangler pages deploy dist --project-name=poc-rtdb
```

---

## ⚙️ Firebase Configuration

### Option 1: Use Environment Variables (Recommended)

Update `src/config/firebase.js` to use environment variables:

```javascript
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};
```

### Option 2: Use Hardcoded Config (Quick Test)

If you just want to test quickly, keep your current hardcoded config in `src/config/firebase.js`. This is fine for POCs but not recommended for production.

---

## 🔒 Security: Update Firebase Rules

Don't forget to update your Firebase Realtime Database rules to allow your Cloudflare domain:

1. Go to **Firebase Console** → **Realtime Database** → **Rules**
2. Add your Cloudflare domain to allowed origins
3. Update CORS settings if needed

---

## 🧪 Testing Your Deployment

After deployment:

1. ✅ Visit your Cloudflare URL
2. ✅ Test login functionality
3. ✅ Create a room
4. ✅ Test presence tracking (open in multiple tabs)
5. ✅ Test auto-close mechanisms
6. ✅ Check browser console for errors

---

## 🔧 Troubleshooting

### Build Fails?

**Check build logs** in Cloudflare dashboard:
- Common issue: Missing environment variables
- Solution: Add all `VITE_*` variables

### Can't Connect to Firebase?

**Check Firebase config**:
```bash
# Test locally first
npm install
npm run dev
```

**Check CORS settings** in Firebase Console

### 404 Errors on Routes?

Cloudflare Pages should automatically handle SPA routing. If not:
- Check that output directory is set to `dist`
- Verify `index.html` exists in build output

---

## 📊 Monitoring

### Cloudflare Analytics
- Go to your Pages project → **Analytics**
- View traffic, performance, and errors

### Firebase Usage
- **Firebase Console** → **Usage**
- Monitor RTDB reads/writes
- Check function invocations (after deploying Cloud Functions)

---

## 🔄 Continuous Deployment

Now that GitHub is connected, **every push to master** will automatically deploy to Cloudflare Pages!

```bash
# Make changes
git add .
git commit -m "Update feature"
git push

# Cloudflare will automatically build and deploy
```

---

## 📱 Custom Domain (Optional)

To use your own domain:

1. Go to Pages project → **Custom domains**
2. Click **Set up a custom domain**
3. Follow DNS configuration steps
4. Wait for SSL certificate (5-10 minutes)

---

## 🎉 Next Steps

After successful deployment:

1. ✅ Test all features online
2. ✅ Deploy Firebase Cloud Functions (see `functions/README.md`)
3. ✅ Share the URL for testing
4. ✅ Monitor performance and costs

---

## 📚 Resources

- [Cloudflare Pages Docs](https://developers.cloudflare.com/pages/)
- [Vite Deployment Guide](https://vitejs.dev/guide/static-deploy.html)
- [Firebase Hosting + Pages](https://firebase.google.com/docs/hosting)
