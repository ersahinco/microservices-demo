# Cart Service

This project is a TypeScript implementation of a cart service that interacts with a Redis database. It provides an API for managing cart items, including adding, retrieving, and deleting items.

## Project Structure

- **src/**: Contains the source code for the cart service.
  - **server.ts**: Entry point of the cart service, sets up the HTTP server and routes.
  - **redis.ts**: Logic for connecting to and interacting with Redis.
  - **types.ts**: TypeScript types and interfaces used throughout the service.
  - **protos/**: Contains Protocol Buffers schema files.
    - **Cart.proto**: Defines the structure of the Cart message and RPC methods.
  
- **Dockerfile**: Instructions for building the Docker image for the cart service.

- **package.json**: Configuration file for npm, listing dependencies and scripts.

- **tsconfig.json**: TypeScript configuration file specifying compiler options.

## Setup Instructions

1. **Clone the repository**:
   ```
   git clone <repository-url>
   cd cartservice
   ```

2. **Install dependencies**:
   ```
   npm install
   ```

3. **Build the project**:
   ```
   npm run build
   ```

4. **Run the service**:
   ```
   npm start
   ```

## Usage

The cart service exposes several endpoints for managing cart items. You can use tools like Postman or curl to interact with the API.

## Docker

To build and run the Docker container, use the following commands:

1. **Build the Docker image**:
   ```
   docker build -t cartservice .
   ```

2. **Run the Docker container**:
   ```
   docker run -p 3000:3000 cartservice
   ```

## Contributing

Contributions are welcome! Please open an issue or submit a pull request for any improvements or bug fixes.

## License

This project is licensed under the MIT License.