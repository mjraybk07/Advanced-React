import React, { Component } from 'react';
import { Mutation, Query } from 'react-apollo';
import gql from 'graphql-tag';
import Router from 'next/router';
import Form from './styles/Form';
import Error from './ErrorMessage';


class DeleteItem extends Component{
  state = {

  }


  render () {
    return (
      <div> DELETE.... id: {this.props.id}</div>
    )
  }
}

export default DeleteItem;
