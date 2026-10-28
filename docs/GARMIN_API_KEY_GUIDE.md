# Garmin Connect Personal API Key Guide

The dashboard supports passwordless live synchronization via Garmin's official **Personal API Key**.

---

## 🔑 Why Use a Personal API Key?

- **Passwordless:** No need to expose your Garmin Connect password to local tools.
- **No MFA / 2FA Verification Prompts:** Unlike email/password logins, the API key does not trigger temporary security passcode emails or SMS codes.
- **Official & Reliable:** Connects directly to Garmin's developer endpoints (`https://personal.connectapi.garmin.com`), avoiding rate-limit or bot detection issues.
- **Full History Sync:** Pulls all your activities, nightly sleep architecture (deep, light, REM, awake), Heart Rate Variability (HRV), and daily metrics (steps, active calories, resting HR).

---

## 📝 How to Generate Your Garmin Personal API Key

1. **Open Garmin Connect Account Settings**  
   Navigate to [https://connect.garmin.com/app/settings](https://connect.garmin.com/app/settings) in your web browser and log in to your Garmin account.

2. **Navigate to Developer Settings**  
   Scroll down the settings page until you locate the **"Developer"** or **"Personal API Key"** section.

3. **Create Key**  
   Click the **"Create Key"** or **"Generate API Key"** button.

4. **Select Expiration & Agree to Terms**  
   - Select your preferred expiration period (e.g., **180 Days** or **1 Year**).  
   - Review and accept the Garmin Developer terms of service.

5. **Copy the Key Immediately**  
   > ⚠️ **Important:** Your API key begins with `GCDC_` and is **only displayed once**. Garmin will not show it again after you navigate away. Copy and save it securely.

6. **Paste and Sync in the Dashboard**  
   - Open the dashboard at `http://localhost:5173`.
   - Click **Import / Sync** in the top navigation.
   - Select the **Garmin Connect** tab and ensure **Personal API Key** mode is selected.
   - Paste your `GCDC_...` key.
   - Select **All Available Data (Full History)** and click **Sync Garmin Data with API Key**.

---

## 💻 Sync via Terminal / CLI

You can also run a sync at any time directly from the command line:

```bash
# Sync using environment variable or arguments
uv run python -c "
from backend.garmin_personal_api import GarminPersonalApiProvider
key = 'YOUR_GCDC_KEY'
provider = GarminPersonalApiProvider(key)
res = provider.full_sync(days_back=0, progress_cb=print)
print('Done:', res)
"
```

Your key will also be saved locally in `data/health.db` (and `data/.garmin_api_key`) so future syncs can run without re-entering the key.

