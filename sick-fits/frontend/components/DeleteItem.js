import React, { Component } from 'react';
import { Mutation, Query } from 'react-apollo';
import gql from 'graphql-tag';
import Router from 'next/router';
import Form from './styles/Form';
import Error from './ErrorMessage';


class DeleteItem extends Component{
  state = {};


  render () {
    return (
      <button> {this.props.children} </button>
    )
  }
}

export default DeleteItem;
