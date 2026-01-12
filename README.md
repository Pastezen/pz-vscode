# Pastezen VS Code Extension

Create and manage code pastes directly from Visual Studio Code.

## Features

- 🚀 **Create pastes from selection** - Right-click on selected code to create a paste
- 📄 **Create pastes from file** - Share entire files with one command
- 📋 **Paste management sidebar** - View all your pastes in the sidebar
- 🔗 **Quick URL copy** - Automatically copies paste URL to clipboard
- 🗑️ **CRUD operations** - Create, read, update, and delete pastes
- 🔐 **Secure authentication** - Uses API tokens for secure access

## Installation

1. Install the extension from VS Code Marketplace
2. Get your API token from [Pastezen](https://pastezen.com/tokens)
3. Run command: `Pastezen: Set API Token`
4. Enter your token

## Usage

### Create Paste from Selection

1. Select code in the editor
2. Right-click → `Pastezen: Create Paste from Selection`
3. Enter a title
4. URL is automatically copied to clipboard!

### Create Paste from File

1. Open a file
2. Right-click → `Pastezen: Create Paste from File`
3. Enter a title
4. URL is automatically copied to clipboard!

### Manage Pastes

1. Open the Pastezen sidebar (activity bar icon)
2. View all your pastes
3. Click to open in browser
4. Use icons to copy URL or delete

## Commands

- `Pastezen: Create Paste from Selection` - Create paste from selected text
- `Pastezen: Create Paste from File` - Create paste from entire file
- `Pastezen: Set API Token` - Configure your API token
- `Pastezen: Refresh Pastes` - Refresh paste list
- `Pastezen: Open Paste` - Open paste in browser
- `Pastezen: Copy Paste URL` - Copy paste URL to clipboard
- `Pastezen: Delete Paste` - Delete a paste

## Configuration

- `pastezen.apiToken` - Your Pastezen API token
- `pastezen.apiUrl` - API URL (default: https://backend.pastezen.com)
- `pastezen.webUrl` - Web URL (default: https://pastezen.com)
- `pastezen.defaultVisibility` - Default paste visibility (public/private)

## Requirements

- VS Code 1.75.0 or higher
- Pastezen account with API token

## Getting Your API Token

1. Go to [Pastezen](https://pastezen.com)
2. Log in or create an account
3. Navigate to **API Tokens** in the sidebar
4. Click **Create New Token**
5. Copy the token and paste it in VS Code

## Support

- [Documentation](https://pastezen.com/docs)
- [GitHub Issues](https://github.com/pastezen/vscode-extension/issues)
- [Website](https://pastezen.com)

## License

MIT
