import React from 'react';
import './App.css';
import io from "socket.io-client";
import prostgles from "prostgles-client";

export default class App extends React.Component {
  constructor(props){
    super(props);
    this.state = {
      items: []
    }
  }

  componentDidMount(){
    prostgles({
        socket: io(), 
        isReady: async (db) => {
          const itemsSync = db.items.getSync({});
          itemsSync.subscribeAll(items => {
            this.setState({ items });
          });
          
          this.setState({ db, itemsSync });
          // db.items.subscribe({}, { orderBy: { id: true }, limit: 10 }, items => {
          //   this.setState({ items });
          // });
        },
    });
  }

  render(){
    const { items, db, itemsSync } = this.state;

    if(!db) return null;
    return (
      <div className="flex-col" style={{ maxWidth: "20em", margin: "auto" }}>
        <div className="flex-col">
          {items
            .sort((a, b) => (+a.id) - (+b.id))
            .map(({ id, name }) => (
              <div key={id} className="flex-row">
                <input 
                  value={name} 
                  onInput={e => { 
                    itemsSync.upsert([{ id, name: e.target.value }])
                    // db.items.update({ id }, { name: e.target.value });
                  }}
                />
                <button onClick={() => itemsSync.delete({ id }) }>delete</button>
              </div>
            ))}
        </div>
        <button onClick={()=>{ db.items.insert({ name: "new item..."}) }}>add item</button>
      </div>
    );
  }
}