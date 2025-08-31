import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { QdrantClient } from '@qdrant/js-client-rest';
import { Ollama } from 'ollama';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

describe('Integration Tests - Real MCP Data', () => {
  let qdrantClient: QdrantClient;
  let ollamaClient: Ollama;

  // Configuration from environment variables
  const config = {
    qdrant: {
      url: process.env.QDRANT_URL || 'http://localhost:6333',
      apiKey: process.env.QDRANT_API_KEY,
      https: process.env.QDRANT_HTTPS === 'true'
    },
    embedding: {
      model: process.env.OLLAMA_MODEL || 'nomic-embed-text:v1.5',
      dimensions: parseInt(process.env.EMBEDDING_DIMENSIONS || '768'),
      chunkSize: parseInt(process.env.CHUNK_SIZE || '1000')
    },
    ollama: {
      host: process.env.OLLAMA_HOST || 'http://localhost:11434'
    },
    collection: {
      name: process.env.COLLECTION_NAME || 'code_index'
    }
  };

  beforeAll(async () => {
    console.log('🔧 Using configuration:', {
      qdrant: config.qdrant.url,
      model: config.embedding.model,
      dimensions: config.embedding.dimensions,
      collection: config.collection.name
    });

    // Initialize clients with real configuration
    qdrantClient = new QdrantClient({
      url: config.qdrant.url,
      apiKey: config.qdrant.apiKey,
    });

    ollamaClient = new Ollama({
      host: config.ollama.host,
    });
  }, 30000);

  describe('🔗 Connectivity Tests', () => {
    test('should connect to Qdrant successfully', async () => {
      try {
        const collections = await qdrantClient.getCollections();
        console.log('✅ Qdrant connection successful');
        console.log(`📊 Found ${collections.collections.length} collections`);
        expect(collections).toBeDefined();
        expect(Array.isArray(collections.collections)).toBe(true);
      } catch (error) {
        console.error('❌ Qdrant connection failed:', error);
        throw error;
      }
    }, 10000);

    test('should connect to Ollama successfully', async () => {
      try {
        const models = await ollamaClient.list();
        console.log('✅ Ollama connection successful');
        console.log('📋 Available models:', models.models?.map(m => m.name));
        expect(models.models).toBeDefined();
        expect(models.models.length).toBeGreaterThan(0);
      } catch (error) {
        console.error('❌ Ollama connection failed:', error);
        throw error;
      }
    }, 10000);

    test('should verify embedding model is available', async () => {
      try {
        const models = await ollamaClient.list();
        const modelExists = models.models?.some(m => m.name === config.embedding.model);
        console.log(`🔍 Checking for model: ${config.embedding.model}`);

        if (!modelExists) {
          console.log('📥 Model not found, available models:', models.models?.map(m => m.name));
        }

        expect(modelExists).toBe(true);
        console.log('✅ Embedding model is available');
      } catch (error) {
        console.error('❌ Model check failed:', error);
        throw error;
      }
    }, 10000);
  });

  describe('📊 Database Operations', () => {
    const testCollectionName = 'test_collection_' + Date.now();

    test('should create collection successfully', async () => {
      try {
        await qdrantClient.createCollection(testCollectionName, {
          vectors: {
            size: config.embedding.dimensions,
            distance: 'Cosine',
          },
        });
        console.log(`✅ Test collection '${testCollectionName}' created`);

        // Verify collection exists
        const collections = await qdrantClient.getCollections();
        const collectionExists = collections.collections.some(c => c.name === testCollectionName);
        expect(collectionExists).toBe(true);
      } catch (error) {
        console.error('❌ Collection creation failed:', error);
        throw error;
      }
    }, 15000);

    test('should generate embeddings successfully', async () => {
      const testText = "function authenticate(user, password) { return user.validate(password); }";

      try {
        const response = await ollamaClient.embeddings({
          model: config.embedding.model,
          prompt: testText,
        });

        console.log('✅ Embedding generation successful');
        expect(response.embedding).toBeDefined();
        expect(response.embedding.length).toBe(config.embedding.dimensions);
        console.log(`📐 Embedding dimensions: ${response.embedding.length}`);
      } catch (error) {
        console.error('❌ Embedding generation failed:', error);
        throw error;
      }
    }, 15000);

    test('should store and retrieve vectors', async () => {
      const testText = "async function fetchUserData() { return await api.get('/user'); }";

      try {
        // Generate embedding
        const response = await ollamaClient.embeddings({
          model: config.embedding.model,
          prompt: testText,
        });

        // Store vector
        const pointId = Math.floor(Math.random() * 1000000);
        await qdrantClient.upsert(testCollectionName, {
          wait: true,
          points: [
            {
              id: pointId,
              vector: response.embedding,
              payload: {
                content: testText,
                file_path: 'test_file.ts',
                chunk_index: 0,
              },
            },
          ],
        });

        console.log('✅ Vector stored successfully');

        // Search for similar vectors
        const searchResults = await qdrantClient.search(testCollectionName, {
          vector: response.embedding,
          limit: 1,
          with_payload: true,
        });

        expect(searchResults.length).toBeGreaterThan(0);
        expect(searchResults[0].payload?.content).toBe(testText);
        console.log('✅ Vector retrieval successful');
      } catch (error) {
        console.error('❌ Vector operations failed:', error);
        throw error;
      }
    }, 20000);

    afterAll(async () => {
      // Cleanup test collection
      try {
        await qdrantClient.deleteCollection(testCollectionName);
        console.log(`🧹 Test collection '${testCollectionName}' cleaned up`);
      } catch (error) {
        console.warn('⚠️ Cleanup warning:', error.message);
      }
    });
  });

  describe('� File Processing Simulation', () => {
    test('should process TypeScript files correctly', async () => {
      const sampleCode = `
        interface User {
          id: string;
          name: string;
          email: string;
        }

        class UserService {
          async getUser(id: string): Promise<User> {
            return await this.api.get(\`/users/\${id}\`);
          }
        }
      `;

      try {
        // Test embedding generation for TypeScript code
        const response = await ollamaClient.embeddings({
          model: config.embedding.model,
          prompt: sampleCode,
        });

        expect(response.embedding).toBeDefined();
        expect(response.embedding.length).toBe(config.embedding.dimensions);
        console.log('✅ TypeScript code processing successful');
      } catch (error) {
        console.error('❌ TypeScript processing failed:', error);
        throw error;
      }
    }, 15000);

    test('should handle chunking for large files', async () => {
      const largeCode = `
        // This is a large code sample that exceeds chunk size
        ${'// '.repeat(200)}
        class LargeClass {
          ${'method() { return "test"; }\n  '.repeat(50)}
        }
      `;

      try {
        // Simulate chunking logic
        const chunkSize = config.embedding.chunkSize;
        const chunks: string[] = [];

        for (let i = 0; i < largeCode.length; i += chunkSize) {
          chunks.push(largeCode.slice(i, i + chunkSize));
        }

        expect(chunks.length).toBeGreaterThan(1);
        console.log(`✅ File chunking successful: ${chunks.length} chunks created`);

        // Test embedding generation for first chunk
        const response = await ollamaClient.embeddings({
          model: config.embedding.model,
          prompt: chunks[0],
        });

        expect(response.embedding).toBeDefined();
        console.log('✅ Chunked content embedding successful');
      } catch (error) {
        console.error('❌ Chunking test failed:', error);
        throw error;
      }
    }, 15000);
  });

  describe('🔍 Search Functionality', () => {
    const testCollectionName = 'search_test_' + Date.now();

    beforeAll(async () => {
      // Create test collection and add sample data
      await qdrantClient.createCollection(testCollectionName, {
        vectors: {
          size: config.embedding.dimensions,
          distance: 'Cosine',
        },
      });

      // Add sample code snippets
      const sampleCodes = [
        "function authenticate(user, password) { return bcrypt.compare(password, user.hash); }",
        "const LoginForm = () => { return <form onSubmit={handleLogin}>...</form>; }",
        "async function fetchUserProfile(id) { return await database.users.findById(id); }",
        "class UserRepository { async save(user) { return this.db.insert(user); } }"
      ];

      for (let i = 0; i < sampleCodes.length; i++) {
        const response = await ollamaClient.embeddings({
          model: config.embedding.model,
          prompt: sampleCodes[i],
        });

        await qdrantClient.upsert(testCollectionName, {
          wait: true,
          points: [
            {
              id: i + 1,
              vector: response.embedding,
              payload: {
                content: sampleCodes[i],
                file_path: `test_file_${i + 1}.ts`,
                type: 'code_snippet',
              },
            },
          ],
        });
      }
    }, 30000);

    test('should find relevant code using semantic search', async () => {
      try {
        // Search for authentication-related code
        const queryText = "user login validation";
        const queryResponse = await ollamaClient.embeddings({
          model: config.embedding.model,
          prompt: queryText,
        });

        const searchResults = await qdrantClient.search(testCollectionName, {
          vector: queryResponse.embedding,
          limit: 3,
          with_payload: true,
          score_threshold: 0.1,
        });

        console.log(`🔍 Search for "${queryText}" found ${searchResults.length} results`);

        // Should find authentication-related code
        expect(searchResults.length).toBeGreaterThan(0);

        // Check if authentication function is in results
        const hasAuthCode = searchResults.some(result =>
          typeof result.payload?.content === 'string' && result.payload.content.includes('authenticate')
        );

        console.log('📋 Search results:', searchResults.map(r => ({
          score: r.score,
          content: typeof r.payload?.content === 'string' ? r.payload.content.substring(0, 50) + '...' : 'N/A'
        })));

        expect(hasAuthCode).toBe(true);
        console.log('✅ Semantic search successful');
      } catch (error) {
        console.error('❌ Search test failed:', error);
        throw error;
      }
    }, 20000);

    afterAll(async () => {
      try {
        await qdrantClient.deleteCollection(testCollectionName);
        console.log(`🧹 Search test collection cleaned up`);
      } catch (error) {
        console.warn('⚠️ Search cleanup warning:', error.message);
      }
    });
  });

  afterAll(async () => {
    console.log('🎉 Integration tests completed!');
  });
});
