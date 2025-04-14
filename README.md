# ChatWebUI

A simple web-based chat interface that acts as a frontend for an OpenAI-compatible API. It proxies requests through a local Node.js server.

## Features

*   Connects to any OpenAI-compatible API endpoint.
*   Supports streaming responses for real-time interaction.
*   Renders Markdown and LaTeX in chat messages.
*   Injects a configurable system prompt (supports date placeholder `{{date}}`).
*   "Copy" button for rich text message content.
*   "Copy Markdown" button for raw Markdown message content.
*   Optional logging of raw API responses.
*   Simple, clean interface.

## Environment Variables

Create a `.env` file in the project root with the following variables:

```dotenv
# Required: The base URL of the OpenAI-compatible API
API_BASE_URL=https://your-api-endpoint.com/v1

# Required: Your API Key for the service
API_KEY=your_api_key_here

# The model name to use (defaults to gpt-3.5-turbo)
MODEL_NAME=gpt-4

# Optional: The system prompt to send with each request. {{date}} will be replaced with the current date.
API_SYSTEM_PROMPT="You are a helpful assistant. Today's date is {{date}}."

# Optional: Port for the local server (defaults to 3000)
PORT=3000

# Optional: Set to true to enable logging of raw API responses to api_response.log
API_LOG=false
```

## Setup and Installation

1.  Clone the repository:
    ```bash
    git clone https://github.com/iXimNet/ChatWebUI.git
    cd ChatWebUI
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Create your `.env` file by copying the example:
    ```bash
    cp .env.example .env
    ```
4.  Edit the `.env` file with your specific API details (API_BASE_URL, API_KEY, etc.).

## Running the Application

1.  Start the server:
    ```bash
    node server.js
    ```
2.  Open your web browser and navigate to `http://localhost:PORT` (replace `PORT` with the value in your `.env` file or the default 3000).

## Usage

Type your message in the input box at the bottom and press Enter or click the Send button. The assistant's response will appear in the chat window. Use the copy buttons on assistant messages to copy the content.
