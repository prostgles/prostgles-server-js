"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findShortestPath = void 0;
const shortestDistanceNode = (distances, visited) => {
    let shortest = null;
    for (const node in distances) {
        const currentIsShortest = shortest === null || distances[node] < distances[shortest];
        if (currentIsShortest && !visited.includes(node)) {
            shortest = node;
        }
    }
    return shortest;
};
const findShortestPath = (graph, startNode, endNode) => {
    // establish object for recording distances from the start node
    let distances = {};
    distances[endNode] = "Infinity";
    distances = Object.assign(distances, graph[startNode]);
    // track paths
    const parents = { endNode: null };
    for (const child in graph[startNode]) {
        parents[child] = startNode;
    }
    // track nodes that have already been visited
    const visited = [];
    // find the nearest node
    let node = shortestDistanceNode(distances, visited);
    // for that node
    while (node) {
        // find its distance from the start node & its child nodes
        const distance = distances[node];
        const children = graph[node];
        // for each of those child nodes
        for (const child in children) {
            // make sure each child node is not the start node
            if (String(child) === String(startNode)) {
                continue;
            }
            else {
                // save the distance from the start node to the child node
                const newdistance = distance + children[child];
                // if there's no recorded distance from the start node to the child node in the distances object
                // or if the recorded distance is shorter than the previously stored distance from the start node to the child node
                // save the distance to the object
                // record the path
                if (!distances[child] || distances[child] > newdistance) {
                    distances[child] = newdistance;
                    parents[child] = node;
                }
            }
        }
        // move the node to the visited set
        visited.push(node);
        // move to the nearest neighbor node
        node = shortestDistanceNode(distances, visited);
    }
    // using the stored paths from start node to end node
    // record the shortest path
    const shortestPath = [endNode];
    let parent = parents[endNode];
    while (parent) {
        shortestPath.push(parent);
        parent = parents[parent];
    }
    shortestPath.reverse();
    // return the shortest path from start node to end node & its distance
    const results = {
        distance: distances[endNode],
        path: shortestPath,
    };
    return results;
};
exports.findShortestPath = findShortestPath;
/* Usage:

const graph = {
    start: { A: 5, B: 2 },
    A: { start: 1, C: 4, D: 2 },
    B: { A: 8, D: 7 },
    C: { D: 6, end: 3 },
    D: { end: 1 },
    end: {},
};

findShortestPath(graph, 'start', 'end');

{
  "distance": 8,
  "path": [
    "start",
    "A",
    "D",
    "end"
  ]
}




// The graph is unidirectional

const graph = {
    start: { A: 5 },
    end: { A: 1 },
    A: { start: 1, end: 1 },
};

findShortestPath(graph, 'start', 'end');


*/ 
//# sourceMappingURL=shortestPath.js.map