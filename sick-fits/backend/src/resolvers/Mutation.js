const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { randomBytes } = require('crypto');
const { promisify } = require('util');
const { transport, makeANiceEmail }  = require('../mail');
const { hasPermission } = require('../utils');
const stripe = require('../stripe');


const Mutations = {
  async createItem(parent, args, ctx, info){
    // TODO check if they are logged in
    if ( !ctx.request.userId ) { 
      throw new Error('You must be logged in to create a new item.  ')
    }
    
    const item = await ctx.db.mutation.createItem(
      {
        data: {
          // This is how to create a relationship between the Item and the User
          user: {
            connect: {
              id: ctx.request.userId,
            },
          },
          ...args,
        },
      },
      info
    );

    console.log(item);

    return item;
  },

  updateItem(parent, args, ctx, info) {
    // create a copy of updates
    const updates = { ...args }
    // remove ID from updates
    delete updates.id;
    // run the update method
    return ctx.db.mutation.updateItem(
      {
        data: updates,
        where: {
          id: args.id
        }
      }, 
      info
    );
  },

  async deleteItem(parent, args, ctx, info) {
    
    const where = { id: args.id };
    // find the item
    const item = await ctx.db.query.item({ where }, `{id title user{ id }}`)
    // check if they own the item, or have permissions
    const ownsItem = item.user.id === ctx.request.userId;
    const hasPermissions = ctx.request.user.permissions.some(
      permission => ['ADMIN', 'ITEMDELETE'].includes(permission)
    );
    if ( !ownsItem && !hasPermissions ) {
      throw new Error('You don\'t have permission to do that.')

    } 
    return ctx.db.mutation.deleteItem({ where }, info);
  },

  async signup(parent, args, ctx, info) {
    // lowercase thier email
    args.email = args.email.toLowerCase();
    // hash their password
    const password = await bcrypt.hash(args.password, 10);
    // create user in the DB
    const user = await ctx.db.mutation.createUser(
      {
        data: {
          ...args,
          password,
          permissions: { set: ['USER'] }
        }
      }, 
      info
    );
    // create the JWT token for them
    const token = jwt.sign({ userId: user.id }, process.env.APP_SECRET);
    // we set the JWT as a cookie on the response
    ctx.response.cookie('token', token, {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 365, // 1 year cookie
    });
    // finally we return the user to the browser
    return user;
  }, 
  
  async signin(parent, { email, password }, ctx, info) {
    // 1. check if there is a user with that email
    const user = await ctx.db.query.user({ where: { email } });
    if ( !user ) {
      throw new Error(`No such user found for email ${email}`);
    }
    // 2. check if password is correct
    const valid = await bcrypt.compare(password, user.password);
    if ( !valid ) {
      throw new Error('Invalid password');
    }
    // 3. generate a JWT token
    const token = jwt.sign({ userId: user.id }, process.env.APP_SECRET);

    // 4. set the cookie with the token
    ctx.response.cookie('token', token, {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 365, // 1 year cookie
    });
    // 5. return the user
    return user;
  },

  signout(parent, args, ctx, info) {
    ctx.response.clearCookie('token');
    return { message: 'Goodbye.'}
  },

  async requestReset(parent, args, ctx, info) {
    // 1. check if this is a real user
    const user =  await ctx.db.query.user({ where: { email:  args.email } });
    if ( !user ) {
      throw new Error(`No such user found for email ${args.email}`);
    }
    // 2. set a reset token and expiry on that user
    const randomBytesPromise = promisify(randomBytes);
    const resetToken = ( await randomBytesPromise(20) ).toString('hex');
    const resetTokenExpiry = Date.now() + 3600000;  //  1 hour from now
    const res = await ctx.db.mutation.updateUser({
      where: { email: args.email }, 
      data: { resetToken,  resetTokenExpiry }
    });

    // 3. email them that reset token - TODO
    const mailRes = await transport.sendMail({
      from: "wes@wesbos.com",
      to: user.email,
      subject: "Your password reset token",
      html: makeANiceEmail(`Your Password Reset Token is here. 
        \n\n 
        <a href="${process.env.FRONTEND_URL }/reset?resetToken=${resetToken}" >Click here to reset.</a> `)
    })

    // 4. return the message
    return { message: "Thanks"}
  },

  async resetPassword(parent, args, ctx, info) {
    // 1. check if passwords match
    if ( args.password !== args.confirmPassword ) {
      throw new Error('Your passwords do not match');
    }
    
    // 2. check if its a  legit reset token
    // 3. check if its expired
    const [ user ] = await ctx.db.query.users({
      where: {
        resetToken: args.resetToken,
        resetTokenExpiry_gte: Date.now() - 3600000
       }
    })

    if ( !user ) {
      throw new Error('This token is either invalid or expired');
    }

    // 4. hash their new password
    const password = await bcrypt.hash(args.password, 10);

    // 5. save the new password to the user and remove old reset token fields
    const updatedUser = await ctx.db.mutation.updateUser({
      where: { email: user.email },
      data: {
        password,
        resetToken: null,
        resetTokenExpiry: null
      }
    })
     
    // 6. generate JWT
    const token = jwt.sign({ userId: updatedUser.id }, process.env.APP_SECRET)

    // 7. set JWT cookie
    ctx.response.cookie('token', token, {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 365, // 1 year cookie
    });
    
    // 8. return new user
    return updatedUser;
  },

  async updatePermissions(parent, args, ctx, info) {
    // 1. check if they are logged in
    if ( !ctx.request.userId ) {
      throw new Error('You must be logged in!');
    }
    // 2. check if they are the current user
    const currentUser = await ctx.db.query.user({
      where: {
        id: ctx.request.userId
      }
    }, info) 
    // 3. check if they have permissions to do this
    hasPermission(currentUser, ['ADMIN', 'PERMISSIONUPDATE'])
    // 4. update the permissions
    return ctx.db.mutation.updateUser({
      data: { 
        permissions: {
          set: args.permissions
        }
      },
      where: { 
        id: args.userId
      }
    }, info)
  },

  async addToCart( parent, args, ctx, info) {
    // 1. make sure user is signed in
    const { userId } = ctx.request;
    if ( !userId ) {
      throw new Error('You must be signed in to do that.')
    }

    // 2. query the users current cart
    const [existingCartItem] = await ctx.db.query.cartItems(
      {
        where: {
          user: { id: userId },
          item: { id: args.id }
        }
      }
    );

    // 3. check if that item is already in their cart, increment by 1 if it is
    if ( existingCartItem ) {
      console.log('This item is already in their cart');
      return ctx.db.mutation.updateCartItem(
        {
          where: { id: existingCartItem.id },
          data: { quantity: existingCartItem.quantity + 1 }
        },
        info
      )
    } 
    // 4. if not, create a fresh cart item
    return ctx.db.mutation.createCartItem(
       {
        data: {
          user: {
            connect: { id: userId }
          },
          item:  {
            connect: { id: args.id }
          }
        }
      },
      info
    );
  },

  async removeFromCart(parent, args, ctx, info) {
    // find the cart item
    const cartItem = await ctx.db.query.cartItem(
      {
        where: {
          id: args.id
        }
      },
      `{ id, user { id }}`
    )
    // make sure we found an item
    if ( !cartItem ) {
      throw new Error('No cart item found.')
    }
    // make sure they own the cart item
    if ( cartItem.user.id !== ctx.request.userId ) {
      throw new Error('Cheatin, huhh???')
    }
    // delete that cart item
    return ctx.db.mutation.deleteCartItem(
      {
        where: { id:  args.id },
      }, 
      info
    );
  },

  async createOrder(parent, args, ctx, info) {
    // 1. query the current user and make sure they are signed in
    const { userId } = ctx.request;
    if ( !userId ) {
      throw new Error('You must be signed in to complete this order');
    }
    const user = await ctx.db.query.user({ where: { id: userId }}, `
      { 
        id 
        name 
        email 
        cart { 
          id 
          quantity 
          item { 
            title 
            price 
            id 
            description 
            image
            largeImage 
          }
         }
      }`
    )
    // 2. recalculate the total for the price
    const amount = user.cart.reduce( (tally, cartItem) => {
      return tally + cartItem.item.price * cartItem.quantity
    }, 0)

    console.log(`Going to charge for a total of ${amount}`);

    // 3. create the stripe charge (turn token into $$)
    const charge = await stripe.charges.create({
      amount: amount,
      currency: 'USD',
      source: args.token
    })
    // 4. convert the CartItems to OrderItems
    const orderItems = user.cart.map( (cartItem) => {
      const orderItem = {
        ...cartItem.item,
        quantity: cartItem.quantity,
        user: { connect: { id: userId }}
      }
      delete orderItem.id
      return orderItem;
    });

    // 5. create the order
    const order = await ctx.db.mutation.createOrder({
      data: {
        total: charge.amount,
        charge: charge.id,
        items: { create: orderItems },
        user: { connect: { id: user.id  }}
      }
    })

    // 6. clean up - clear the user's cart, delete cartItems
    const cartItemIds = user.cart.map( (cartItem => cartItem.id));

    await ctx.db.mutation.deleteManyCartItems({
      where: {
        id_in: cartItemIds
      }
    });

    // 7. return the order to the client
    //
  }



};

module.exports = Mutations;
