# Setting Up Git Bash for Claude Code (No Admin Rights)

If you encounter the error *"Claude Code on Windows requires git-bash"* and do not have administrator rights to edit system environment variables, follow these methods to set the `CLAUDE_CODE_GIT_BASH_PATH` user variable.

## Method 1: The "Run" Command (GUI) - Recommended
This method bypasses the admin prompt by opening the User Environment Variables dialog directly.

1. Press **Windows Key + R** to open the Run dialog.
2. Paste the following command and press **Enter**:
   ```text
   rundll32 sysdm.cpl,EditEnvironmentVariables
   ```
3. In the top section labeled **"User variables for [YourUsername]"**, click **New...**.
4. Enter the following details:
   - **Variable name:** `CLAUDE_CODE_GIT_BASH_PATH`
   - **Variable value:** `C:\Program Files\Git\bin\bash.exe`
     *(Note: If Git is installed in your user profile, the path might be `C:\Users\YourName\AppData\Local\Programs\Git\bin\bash.exe`)*
5. Click **OK** on all open dialogs.
6. **Restart** your terminal (VS Code, PowerShell, or CMD) for changes to take effect.

## Method 2: PowerShell
Run this command in PowerShell to set the variable permanently for your user account ("User" scope).

```powershell
[System.Environment]::SetEnvironmentVariable("CLAUDE_CODE_GIT_BASH_PATH", "C:\Program Files\Git\bin\bash.exe", "User")
```

## Method 3: Command Prompt (CMD)
Use the `setx` command, which defaults to the user scope and does not require admin rights.

```cmd
setx CLAUDE_CODE_GIT_BASH_PATH "C:\Program Files\Git\bin\bash.exe"
```

## How to Find Your Git Bash Path
If the default path (`C:\Program Files\Git\bin\bash.exe`) is incorrect:

1. Open the Start menu and search for **"Git Bash"**.
2. Right-click it and select **Open file location**.
3. If that opens a shortcut, right-click the shortcut and select **Properties**.
4. Look at the **Target** field.
   - It usually points to `git-bash.exe`.
   - You need the `bash.exe` inside the `bin` folder.
   - **Example:** Change `...\Git\git-bash.exe` to `...\Git\bin\bash.exe`.