const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
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
    // Connect the client to the server
    await client.connect();

    const userCollection = client.db('PetConnectDB').collection('users');
    const petCollection = client.db('PetConnectDB').collection('pets');
    const adoptionCollection = client.db('PetConnectDB').collection('adoptions');
    const donationCampaignCollection = client.db('PetConnectDB').collection('donationCampaigns');

    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: '1hr'
      });
      res.send({ token });
    });


    const verifyToken = (req, res, next) => {
      if (!req.headers.authorization) {
        return res.status(401).send({ message: 'unauthorized access' });
      }
      const token = req.headers.authorization.split(' ')[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: 'unauthorized access' });
        }
        req.decoded = decoded;
        next();
      });
    };

    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === 'admin';
      if (!isAdmin) {
        return res.status(403).send({ message: 'forbidden access' })
      }
      next();
    }
    // Users
    app.get('/users', async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    app.post('/users', async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: 'user already exists', insertedId: null });
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    app.get('/users/admin/:email', async (req, res) => {
      try {
        const user = await userCollection.findOne({ email: req.params.email });
        if (!user) return res.sendStatus(404);
        res.json({ admin: user.role === 'admin' });
      } catch (error) {
        res.status(500).send(error.message);
      }
    });

    app.patch('/users/admin/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          role: 'admin'
        }
      }
      const result = await userCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });

    app.delete('/users/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await userCollection.deleteOne(query);
      res.send(result);
    });

    // Pets
    app.post('/api/pets', async (req, res) => {
      const { name, age, category, location, shortDescription, longDescription, imageUrl, owner, adopted, addedAt } = req.body;
      try {
        const result = await petCollection.insertOne({
          name, age, category, location, shortDescription, longDescription, imageUrl, owner, adopted, addedAt
        });
        res.status(201).send(result);
      } catch (error) {
        res.status(500).send({ error: 'Failed to add pet' });
      }
    });


    // Get all pets with pagination
    app.get('/api/pets', async (req, res) => {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;
      const owner = req.query.owner;
      let filter = { adopted: false };
      if (owner) {
        filter.owner = owner;
      }

      try {

        const pets = await petCollection
          .find(filter)
          .sort({ addedAt: -1 })
          .skip(skip)
          .limit(limit)
          .toArray();
        res.status(200).send(pets);
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

    app.delete('/api/pets/:id', async (req, res) => {
      const { id } = req.params;
      try {
        const result = await petCollection.deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 1) {
          res.status(200).send({ message: 'Pet deleted successfully' });
        } else {
          res.status(404).send({ message: 'Pet not found' });
        }
      } catch (error) {
        res.status(500).send({ error: 'Failed to delete pet' });
      }
    });

    app.put('/api/pets/:id', async (req, res) => {
      const { id } = req.params;
      const updatedData = req.body;
      try {
        const result = await petCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updatedData }
        );
        if (result.matchedCount === 1) {
          res.status(200).send({ message: 'Pet updated successfully' });
        } else {
          res.status(404).send({ message: 'Pet not found' });
        }
      } catch (error) {
        res.status(500).send({ error: 'Failed to update pet' });
      }
    });

    app.patch('/api/pets/:id/adopt', async (req, res) => {
      const { id } = req.params;
      try {
        const result = await petCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { adopted: true } }
        );
        if (result.matchedCount === 1) {
          res.status(200).send({ message: 'Pet marked as adopted' });
        } else {
          res.status(404).send({ message: 'Pet not found' });
        }
      } catch (error) {
        res.status(500).send({ error: 'Failed to mark pet as adopted' });
      }
    });

    // Donation Campaigns
    app.post('/api/donation-campaigns', async (req, res) => {
      const { petName, petImage, maxAmount, lastDate, shortDescription, longDescription, createdAt, owner } = req.body;
      try {
        const result = await donationCampaignCollection.insertOne({
          petName, petImage, maxAmount, lastDate, shortDescription, longDescription, createdAt, owner
        });
        res.status(201).send(result);
      } catch (error) {
        res.status(500).send({ error: 'Failed to create donation campaign' });
      }
    });

    // Get all donation campaigns with pagination
    // Get all donation campaigns with pagination for a specific owner
    app.get('/api/donation-campaigns', async (req, res) => {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 9;
      const skip = (page - 1) * limit;

      try {
        const campaigns = await donationCampaignCollection
          .find()
          .skip(skip)
          .limit(limit)
          .toArray();
        res.status(200).send(campaigns);
      } catch (error) {
        res.status(500).send({ error: 'Failed to fetch donation campaigns' });
      }
    });

    app.get('/api/donation-campaigns/:id', async (req, res) => {
      const { id } = req.params;
      try {
        const campaign = await donationCampaignCollection.findOne({ _id: new ObjectId(id) });
        if (campaign) {
          res.status(200).send(campaign);
        } else {
          res.status(404).send({ message: 'Campaign not found' });
        }
      } catch (error) {
        res.status(500).send({ error: 'Failed to fetch campaign' });
      }
    });

    app.patch('/api/donation-campaigns/:id/pause', async (req, res) => {
      const { id } = req.params;
      const { isPaused } = req.body;
      try {
        const result = await donationCampaignCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { isPaused } }
        );
        if (result.matchedCount === 1) {
          res.status(200).send({ message: 'Campaign updated successfully' });
        } else {
          res.status(404).send({ message: 'Campaign not found' });
        }
      } catch (error) {
        res.status(500).send({ error: 'Failed to update campaign' });
      }
    });

    app.put('/api/donation-campaigns/:id', async (req, res) => {
      const { id } = req.params;
      const updatedData = req.body;
      try {
        const result = await donationCampaignCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updatedData }
        );
        if (result.matchedCount === 1) {
          res.status(200).send({ message: 'Campaign updated successfully' });
        } else {
          res.status(404).send({ message: 'Campaign not found' });
        }
      } catch (error) {
        res.status(500).send({ error: 'Failed to update campaign' });
      }
    });

    app.delete('/api/donation-campaigns/:id', async (req, res) => {
      const { id } = req.params;
      try {
        const result = await donationCampaignCollection.deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 1) {
          res.status(200).send({ message: 'Pet deleted successfully' });
        } else {
          res.status(404).send({ message: 'Pet not found' });
        }
      } catch (error) {
        res.status(500).send({ error: 'Failed to delete pet' });
      }
    });

    // Get adoption requests for user's pets
    app.get('/api/adoption-requests', verifyToken, async (req, res) => {
      const email = req.user.email; // Use req.user set by the middleware
      try {
        const userPets = await petCollection.find({ ownerEmail: email }).toArray();
        const petIds = userPets.map(pet => pet._id);
        const adoptionRequests = await adoptionCollection.find({ petId: { $in: petIds } }).toArray();
        res.status(200).send(adoptionRequests);
      } catch (error) {
        res.status(500).send({ error: 'Failed to fetch adoption requests' });
      }
    });

    // Update adoption request status
    app.patch('/api/adoption-requests/:id', verifyToken, async (req, res) => {
      const { id } = req.params;
      const { status } = req.body; // 'accepted' or 'rejected'
      try {
        await adoptionCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status } }
        );
        res.status(200).send({ message: 'Adoption request updated' });
      } catch (error) {
        res.status(500).send({ error: 'Failed to update adoption request' });
      }
    });

    // Get recommended donation campaigns excluding the current campaign
    app.get('/api/donation-campaigns/recommended', async (req, res) => {
      const excludeId = req.query.exclude;
      try {
        const campaigns = await donationCampaignCollection
          .find({ _id: { $ne: new ObjectId(excludeId) } })
          .limit(3)
          .toArray();
        res.status(200).send(campaigns);
      } catch (error) {
        console.error('Error fetching recommended campaigns:', error);
        res.status(500).send({ error: 'Failed to fetch recommended campaigns' });
      }
    });

   //Payment 
   app.post('/create-payment-intent', async(req,res)=>{
    const {price} = req.body;
    const amount = parseInt(price * 100);
    console.log('inside intent',amount);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount,
      currency: 'usd',
      payment_method_types: ['card']
    });

    res.send({
      clientSecret: paymentIntent.client_secret
    })
  });

  //payment related api
  app.get('/payments/:email', verifyToken, async (req, res) => {
    const query = { email: req.params.email }
    if (req.params.email !== req.decoded.email) {
      return res.status(403).send({ message: 'forbidden access' });
    }
    const result = await paymentCollection.find(query).toArray();
    res.send(result);
  });

  app.post('/payments', async (req, res) => {
    const payment = req.body;
    const paymentResult = await paymentCollection.insertOne(payment);

    //  carefully delete each item from the cart
    console.log('payment info', payment);
    const query = {
      _id: {
        $in: payment.cartIds.map(id => new ObjectId(id))
      }
    };

    const deleteResult = await cartCollection.deleteMany(query);

    res.send({ paymentResult, deleteResult });
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
