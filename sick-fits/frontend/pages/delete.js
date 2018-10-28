import DeleteItem from '../components/DeleteItem';

const Sell = (props) => (
  <div>
    <DeleteItem id={props.query.id}/>
  </div>
)

export default Sell;