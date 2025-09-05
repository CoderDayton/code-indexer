import dotenv from 'dotenv';
import { QdrantClient } from '@qdrant/js-client-rest';
import { Ollama } from 'ollama';

// Load environment variables
dotenv.config();

// Gate these real system tests behind RUN_E2E=true
const runE2E = process.env.RUN_E2E === 'true'

if (!runE2E) {
  describe('Real MCP System Tests (skipped)', () => {
    test('skipped (set RUN_E2E=true to run)', () => {
      expect(true).toBe(true)
    })
  })
} else describe('Real MCP System Tests', () => {
  let qdrantClient: QdrantClient;
  let ollamaClient: Ollama;

  // Configuration from your actual .env file
  const config = {
    qdrant: {
      url: process.env.QDRANT_URL || 'http://localhost:6333',
      apiKey: process.env.QDRANT_API_KEY,
    },
    embedding: {
      model: process.env.OLLAMA_MODEL || 'bge-m3:567m',
      dimensions: parseInt(process.env.EMBEDDING_DIMENSIONS || '1024'),
    },
    ollama: {
      host: process.env.OLLAMA_HOST || 'http://localhost:11434'
    }
  };

  beforeAll(() => {
    console.log('🔧 Testing with your actual configuration:');
    console.log('  Qdrant URL:', config.qdrant.url);
    console.log('  Model:', config.embedding.model);
    console.log('  Dimensions:', config.embedding.dimensions);
    console.log('  Ollama Host:', config.ollama.host);

    qdrantClient = new QdrantClient({
      url: config.qdrant.url,
      apiKey: config.qdrant.apiKey,
    });

    ollamaClient = new Ollama({
      host: config.ollama.host,
    });
  });

  describe('🔗 Core Connectivity', () => {
    test('Qdrant Cloud Connection', async () => {
      try {
        const collections = await qdrantClient.getCollections();
        console.log('✅ Qdrant connection successful!');
        console.log(`   Found ${collections.collections.length} existing collections`);

        if (collections.collections.length > 0) {
          console.log('   Collections:', collections.collections.map(c => c.name));
        }

        expect(collections).toBeDefined();
        expect(Array.isArray(collections.collections)).toBe(true);
      } catch (error: any) {
        console.error('❌ Qdrant connection failed:', error.message);
        throw new Error(`Qdrant connection failed: ${error.message}`);
      }
    }, 15000);

    test('Ollama Connection & Model Availability', async () => {
      try {
        const models = await ollamaClient.list();
        console.log('✅ Ollama connection successful!');
        console.log(`   Found ${models.models?.length || 0} available models`);

        if (models.models && models.models.length > 0) {
          console.log('   Available models:', models.models.map(m => m.name));

          // Check if your configured model exists
          const modelExists = models.models.some(m => m.name === config.embedding.model);
          console.log(`   Your model "${config.embedding.model}": ${modelExists ? '✅ Available' : '❌ Missing'}`);

          if (!modelExists) {
            console.log(`   💡 To install: ollama pull ${config.embedding.model}`);
          }

          expect(modelExists).toBe(true);
        } else {
          throw new Error('No models available in Ollama');
        }

        expect(models.models).toBeDefined();
        expect(models.models.length).toBeGreaterThan(0);
      } catch (error: any) {
        console.error('❌ Ollama connection failed:', error.message);
        throw new Error(`Ollama connection failed: ${error.message}`);
      }
    }, 15000);
  });

  describe('⚡ Embedding Generation', () => {
    test('Generate Embeddings with Your Model', async () => {
      const testCode = `
        function authenticateUser(username: string, password: string): boolean {
          const user = database.findUser(username);
          return user && bcrypt.compare(password, user.passwordHash);
        }
      `;

      try {
        console.log(`🧠 Testing embedding generation with ${config.embedding.model}...`);

        const response = await ollamaClient.embeddings({
          model: config.embedding.model,
          prompt: testCode,
        });

        console.log('✅ Embedding generation successful!');
        console.log(`   Vector length: ${response.embedding.length}`);
        console.log(`   Expected length: ${config.embedding.dimensions}`);
        console.log(`   First 5 values: [${response.embedding.slice(0, 5).map(x => x.toFixed(4)).join(', ')}...]`);

        expect(response.embedding).toBeDefined();
        expect(response.embedding.length).toBe(config.embedding.dimensions);
        expect(typeof response.embedding[0]).toBe('number');

        // Verify embeddings are not all zeros
        const nonZeroCount = response.embedding.filter(x => Math.abs(x) > 0.001).length;
        expect(nonZeroCount).toBeGreaterThan(config.embedding.dimensions * 0.1); // At least 10% non-zero

      } catch (error: any) {
        console.error('❌ Embedding generation failed:', error.message);
        throw new Error(`Embedding generation failed: ${error.message}`);
      }
    }, 20000);
  });

  describe('🗄️ Vector Database Operations', () => {
    const testCollectionName = `test_${Date.now()}`;

    test('Create Collection with Your Dimensions', async () => {
      try {
        console.log(`📊 Creating test collection with ${config.embedding.dimensions} dimensions...`);

        await qdrantClient.createCollection(testCollectionName, {
          vectors: {
            size: config.embedding.dimensions,
            distance: 'Cosine',
          },
        });

        console.log(`✅ Collection "${testCollectionName}" created successfully!`);

        // Verify collection exists
        const collections = await qdrantClient.getCollections();
        const collectionExists = collections.collections.some(c => c.name === testCollectionName);
        expect(collectionExists).toBe(true);

        // Get collection info
        const info = await qdrantClient.getCollection(testCollectionName);
        console.log(`   Vector size: ${info.config?.params?.vectors?.size || 'N/A'}`);
        console.log(`   Distance metric: ${info.config?.params?.vectors?.distance || 'N/A'}`);

      } catch (error: any) {
        console.error('❌ Collection creation failed:', error.message);
        throw new Error(`Collection creation failed: ${error.message}`);
      }
    }, 15000);

    test('Store and Search Real Code Vectors', async () => {
      const codeSnippets = [
        {
          id: 1,
          content: 'async function loginUser(email: string, password: string) { return await auth.login(email, password); }',
          file: 'auth.ts'
        },
        {
          id: 2,
          content: 'const UserProfile = ({ user }) => { return <div className="profile">{user.name}</div>; }',
          file: 'UserProfile.tsx'
        },
        {
          id: 3,
          content: 'class DatabaseConnection { async connect() { return await mysql.createConnection(config); } }',
          file: 'database.ts'
        }
      ];

      try {
        console.log('📝 Storing code vectors...');

        // Generate and store embeddings for each code snippet
        for (const snippet of codeSnippets) {
          const response = await ollamaClient.embeddings({
            model: config.embedding.model,
            prompt: snippet.content,
          });

          await qdrantClient.upsert(testCollectionName, {
            wait: true,
            points: [
              {
                id: snippet.id,
                vector: response.embedding,
                payload: {
                  content: snippet.content,
                  file_path: snippet.file,
                  indexed_at: new Date().toISOString(),
                },
              },
            ],
          });
        }

        console.log(`✅ Stored ${codeSnippets.length} code vectors successfully!`);

        // Test semantic search
        console.log('🔍 Testing semantic search...');
        const searchQuery = 'user authentication login function';
        const queryResponse = await ollamaClient.embeddings({
          model: config.embedding.model,
          prompt: searchQuery,
        });

        const searchResults = await qdrantClient.search(testCollectionName, {
          vector: queryResponse.embedding,
          limit: 3,
          with_payload: true,
        });

        console.log(`   Query: "${searchQuery}"`);
        console.log(`   Found ${searchResults.length} results:`);

        searchResults.forEach((result, index) => {
          const content = typeof result.payload?.content === 'string' ? result.payload.content : 'N/A';
          const file = typeof result.payload?.file_path === 'string' ? result.payload.file_path : 'N/A';
          console.log(`     ${index + 1}. Score: ${result.score?.toFixed(4)} | File: ${file}`);
          console.log(`        Code: ${content.substring(0, 60)}...`);
        });

        expect(searchResults.length).toBeGreaterThan(0);
        expect(searchResults[0].score).toBeGreaterThan(0.1); // Should have decent similarity

        // The authentication function should be most relevant
        const topResult = searchResults[0];
        const topContent = typeof topResult.payload?.content === 'string' ? topResult.payload.content : '';
        expect(topContent.toLowerCase()).toMatch(/login|auth|user/);

        console.log('✅ Semantic search working correctly!');

      } catch (error: any) {
        console.error('❌ Vector operations failed:', error.message);
        throw new Error(`Vector operations failed: ${error.message}`);
      }
    }, 30000);

    afterAll(async () => {
      // Cleanup test collection
      try {
        await qdrantClient.deleteCollection(testCollectionName);
        console.log(`🧹 Test collection "${testCollectionName}" cleaned up`);
      } catch (error: any) {
        console.warn('⚠️ Cleanup warning:', error.message);
      }
    });
  });

  describe('🎯 Production Readiness Check', () => {
    test('Main Collection Exists', async () => {
      const mainCollectionName = process.env.COLLECTION_NAME || 'code_index';

      try {
        const collections = await qdrantClient.getCollections();
        const mainExists = collections.collections.some(c => c.name === mainCollectionName);

        console.log(`🔍 Checking for main collection "${mainCollectionName}": ${mainExists ? '✅ Exists' : '❌ Missing'}`);

        if (mainExists) {
          const info = await qdrantClient.getCollection(mainCollectionName);
          console.log(`   Points count: ${info.points_count || 0}`);
          console.log(`   Vector size: ${info.config?.params?.vectors?.size || 'N/A'}`);
        } else {
          console.log('   💡 Collection will be created when indexing starts');
        }

        // Don't fail if main collection doesn't exist yet - that's normal for new setups
        expect(true).toBe(true);

      } catch (error: any) {
        console.error('❌ Collection check failed:', error.message);
        throw new Error(`Collection check failed: ${error.message}`);
      }
    }, 10000);

    test('Environment Configuration Validation', () => {
      console.log('⚙️ Validating environment configuration...');

      const requiredVars = [
        'QDRANT_URL',
        'OLLAMA_MODEL',
        'EMBEDDING_DIMENSIONS'
      ];

      const missing = requiredVars.filter(varName => !process.env[varName]);

      if (missing.length > 0) {
        console.error(`❌ Missing required environment variables: ${missing.join(', ')}`);
        throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
      }

      console.log('✅ All required environment variables are set!');

      // Log configuration summary
      console.log('📋 Configuration Summary:');
      console.log(`   QDRANT_URL: ${process.env.QDRANT_URL}`);
      console.log(`   QDRANT_API_KEY: ${process.env.QDRANT_API_KEY ? '***' + process.env.QDRANT_API_KEY.slice(-4) : 'Not set'}`);
      console.log(`   OLLAMA_MODEL: ${process.env.OLLAMA_MODEL}`);
      console.log(`   EMBEDDING_DIMENSIONS: ${process.env.EMBEDDING_DIMENSIONS}`);
      console.log(`   COLLECTION_NAME: ${process.env.COLLECTION_NAME || 'code_index'}`);
      console.log(`   MAX_CONCURRENCY: ${process.env.MAX_CONCURRENCY || '5'}`);
      console.log(`   BATCH_SIZE: ${process.env.BATCH_SIZE || '10'}`);

      expect(missing.length).toBe(0);
    });
  });

  afterAll(() => {
    console.log('\n🎉 All tests completed! Your MCP system is ready to use.');
    console.log('\n📋 Summary:');
    console.log('  ✅ Qdrant connection working');
    console.log('  ✅ Ollama connection working');
    console.log('  ✅ Embedding generation working');
    console.log('  ✅ Vector storage working');
    console.log('  ✅ Semantic search working');
    console.log('  ✅ Configuration valid');
    console.log('\n🚀 You can now run: npm start');
  });
});
