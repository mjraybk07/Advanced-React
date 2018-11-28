import react from 'react';
import { Mutation } from 'react-apollo';
import styled from 'styled-components';
import PropTypes from 'prop-types';
import gql from 'graphql-tag';
import { CURRENT_USER_QUERY } from './User';

const REMOVE_FROM_CART_MUTATION = gql`
  mutation removeFromCart( $id: ID! ) {
    removeFromCart(id:$id) {
      id
    }
  }
`;

const BigButton = styled.button`
  font-size: 3rem;
  background: none;
  border: 0;
  &:hover{
     color: ${props => props.theme.red};
     cursor: pointer; 
  }
`;

class RemoveFromCart extends React.Component {
  static propTypes = {
    id: PropTypes.string.isRequired
  };
  
  // this gets called after a mutation has been performed, as soon as we get a response 
  update = (cache, payload) => {
    console.log('running remove from cart function');
    // 1. read the cache
    const data = cache.readQuery({ query: CURRENT_USER_QUERY })
    console.log(data);
    
    // 2. remove the item from the cart
    const cartItemId = payload.data.removeFromCart.id;
    data.me.cart = data.me.cart.filter((cartItem)=>{
      return cartItem.id !== cartItemId;
    })
    // 3. write it back to the cache
    cache.writeQuery({ query: CURRENT_USER_QUERY, data })

  }


  render () {
    const { id } = this.props;
    return (
      <Mutation 
        mutation={REMOVE_FROM_CART_MUTATION}
        variables={ { id: id } }
        update={this.update}
        refetchQueries={[{query: CURRENT_USER_QUERY}]}
        optimisticResponse={{
          __typename: 'Mutation',
          removeFromCart: {
            __typename: 'CartItem',
            id: id
          }
        }}
      >
        {( removeFromCart, { loading, error}) => 
          <BigButton 
            disabled={loading}
            onClick={( ) => {
              console.log('this is the id..', id)
              removeFromCart()
              .catch( (err) => {
                alert(err.message )
              });
            }}
            title="Delete Item "
          >
           &times;
          </BigButton>
        }
      </Mutation>

    )
  }
}

export default RemoveFromCart;
