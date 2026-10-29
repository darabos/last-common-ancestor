# Last Common Ancestor

Make a simple HTML+JavaScript page that simulates the evolution of a population.

The evolution is modeled as simply one generation after another.
Here is how we generate the next generation:
- Create N individuals.
- For each individual randomly choose a gender.
- For each individual randomly choose a father and a mother from the previous generation.

We generate G_1 generations, then split the population into two sets of size N/2,
left and right. We then generate G_2 generations, where the left and right
populations remain size N/2 and choose parents from the same set.

Create controls for setting N, G_1, and G_2, and a button to run the generator.

Visualize the resulting genealogy. Draw each individual as a circle.
The first generation is in the first row, the second generation below, and so on.
After the split the left and right subpopulations are on the left and right side.
Parents and children are connected with a curved connector.

When a user clicks an individual, highlight all their ancestors and descendants.
Click the individual again to deselect them.
When multiple individuals are selected (and this can be more than two),
highlight their last common ancestor(s). Common ancestors are individuals
who are ancestors of all the selected individuals. The last common ancestor(s)
are those common ancestors that are in the newest generation.
