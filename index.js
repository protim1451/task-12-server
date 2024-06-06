const express = require('express');
const app = express();
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.edgm8kl.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const userCollection = client.db('PetConnectDB').collection('users');
    const petCollection = client.db('PetConnectDB').collection('pets');
    const adoptionCollection = client.db('PetConnectDB').collection('adoptions');

    //Users
    app.get('/users', async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    app.post('/users', async (req, res) => {
      const user = req.body;
      // const query = { email: user.email }
      // const existingUser = await userCollection.findOne(query);
      // if(existingUser){
      //   return res.send({ message: 'user already exists', insertedId: null })
      // }
      const result = await userCollection.insertOne(user);
      res.send(result);
    });


    //Pets
    app.post('/api/pets', async (req, res) => {
      const { name, age, category, location, shortDescription, longDescription, imageUrl, owner, adopted, addedAt } = req.body;
      try {
        const result = await client.db('PetConnectDB').collection('pets').insertOne({
          name, age, category, location, shortDescription, longDescription, imageUrl, owner, adopted, addedAt
        });
        res.status(201).send(result);
      } catch (error) {
        res.status(500).send({ error: 'Failed to add pet' });
      }
    });

    // Get all pets
    // Get all pets with pagination
    app.get('/api/pets', async (req, res) => {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;

      try {
        const pets = await petCollection.find({ adopted: false }).sort({ addedAt: -1 }).skip(skip).limit(limit).toArray();
        res.send(pets);
      } catch (error) {
        res.status(500).send({ message: 'Error fetching pets', error });
      }
    });

    app.post('/api/adoptions', async (req, res) => {
      const adoptionData = req.body;
      try {
        const result = await adoptionCollection.insertOne(adoptionData);
        res.status(201).send(result);
      } catch (error) {
        res.status(500).send({ error: 'Failed to submit adoption request' });
      }
    });

    app.get('/api/pets/:id', async (req, res) => {
      const { id } = req.params;
      try {
        const pet = await petCollection.findOne({ _id: new ObjectId(id) });
        res.status(200).send(pet);
      } catch (error) {
        res.status(500).send({ error: 'Failed to fetch pet details' });
      }
    });


    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    //await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send('server running');
});

app.listen(port, () => {
  console.log(`server is running on port ${port}`);
});