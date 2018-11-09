const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');

require('dotenv').config({ path: 'variables.env' });
const createServer = require('./createServer');
const db = require('./db');

const server = createServer();

// express middleware to handle cookies
server.express.use(cookieParser())
// TODO use express middleware to populate current user
// decode the JWT so we can get user id on each request
server.express.use((req, res, next) => {
  const { token } = req.cookies;
  if ( token ) {
    const { userId } = jwt.verify(token, process.env.APP_SECRET);
    // put the user id onto the req for future requests
    req.userId = userId;
  }
  next();
})

// create a middleware that populates the user on each request
server.express.use(async (req, res, next) =>  {
  // if they are not logged, in skip this
  if ( !req.userId ) {
    return next();
  }
  const user = await db.query.user(
    { where: { id: req.userId } },
    '{ id, permissions, email, name }'
    
  )
  console.log(user);
  req.user = user; 
  next();
})


server.start({
  cors:  {
    credentials: true,
    origin:  process.env.FRONTEND_URL
  }
}, details => {console.log(`Server is now running on port http://localhost:${details.port}`)})