class ScrollerVis {

  constructor(_config, _data) {
    this.config = {
      parentElement: _config.parentElement,
      containerWidth: 400,
      containerHeight: 600,
      cellWidth: 50,
      cellHeight: 50,
      cellSpacing: 12,
      yAxisWidth: 150,
      barHeight: 50,
      barSpacing: 6,
      margin: {top: 5, right: 30, bottom: 5, left: 5},
      steps: ['step0', 'step1', 'step2', 'step3', 'step4']
    }
    this.data = _data;
    this.initVis();
  }
  
  /**
   * We initialize scales/axes and append static elements, such as axis titles.
   */
  initVis() {
    let vis = this;

    // Identify assignments with the longest time
    const dataTop5 = [...vis.data].sort((a,b) => b.time - a.time).slice(0,5);
    const namesTop5 = dataTop5.map(d => d.name);
    vis.data.forEach(d => {
      d.rank = namesTop5.indexOf(d.name);
    });

    vis.dataLongestAssignment = dataTop5[0];

    // Calculate inner chart size. Margin specifies the space around the actual chart.
    vis.config.width = vis.config.containerWidth - vis.config.margin.left - vis.config.margin.right;
    vis.config.height = vis.config.containerHeight - vis.config.margin.top - vis.config.margin.bottom;

    vis.xScale = d3.scaleLinear()
        .range([0, vis.config.width-vis.config.yAxisWidth])
        .domain([0, d3.max(dataTop5, d => d.time)]);

    // Define size of SVG drawing area
    vis.svg = d3.select(vis.config.parentElement).append('svg')
        .attr('width', vis.config.containerWidth)
        .attr('height', vis.config.containerHeight);

    // Append group element that will contain our actual chart 
    // and position it according to the given margin config
    vis.chart = vis.svg.append('g')
        .attr('transform', `translate(${vis.config.margin.left},${vis.config.margin.top})`);

    // Initialize scales
    vis.colorScale = d3.scaleOrdinal()
        .range(['#78ab9c', '#e2cc00', '#c5eadf'])
        .domain(['default','highlighted', 'inactive']);

    // Calculate number of columns and rows for the grid layout
    vis.config.columns = Math.floor(vis.config.width / (vis.config.cellWidth + vis.config.cellSpacing));
    vis.config.rows = Math.ceil(vis.data.length / vis.config.columns);

    // Bind data to rectangles but don't specify any attributes yet
    vis.rect = vis.chart.selectAll('rect')
        .data(vis.data, d => d.name).join('rect');

    // Call first step
    vis.step0();
  }
  step0() {
    const vis = this;

    // Arrange rectangles in grid layout and set a default colour
    vis.rect.transition()
        .attr('opacity', 1)
        .attr('fill', vis.colorScale('default'))
        .attr('width', d => vis.config.cellWidth)
        .attr('height', d => vis.config.cellHeight)
        .attr('x', (d, i) => i % vis.config.columns * (vis.config.cellWidth + vis.config.cellSpacing))
        .attr('y', (d, i) => Math.floor(i / vis.config.columns) * (vis.config.cellHeight + vis.config.cellSpacing));
  }

  step1() {
    const vis = this;

    // Change the colour of some rectangles to highlight them
    vis.rect.transition()
        .attr('fill', d => d.difficulty=='Easy' ? vis.colorScale('highlighted') : vis.colorScale('default'));
  }

  step2() {
    const vis = this;

    // Change the colour of other rectangles
    vis.rect.transition()
        .attr('fill', d => d.difficulty=='Difficult' ? vis.colorScale('highlighted') : vis.colorScale('default'));
  }

  step3() {
    const vis = this;
    
    // Highlight one trail
    // Important: We also need to update the width, height, etc because these attributes are
    // getting changed in step4() and we want to allow users to scroll up and down.
    vis.rect.transition()
        .attr('opacity', 1)
        .attr('fill', d => d.name==vis.dataLongestAssignment.name ? vis.colorScale('highlighted') : vis.colorScale('inactive'))
        .attr('width', d => vis.config.cellWidth)
        .attr('height', d => vis.config.cellHeight)
        .attr('x', (d, i) => i % vis.config.columns * (vis.config.cellWidth + vis.config.cellSpacing))
        .attr('y', (d, i) => Math.floor(i / vis.config.columns) * (vis.config.cellHeight + vis.config.cellSpacing));

    if (vis.textG) vis.textG.remove();
  }

  step4() {
    const vis = this;

    vis.rect
        .attr('fill', vis.colorScale('default'))
        .attr('opacity', 0);
    
      vis.rect.filter(d => d.rank >= 0)
        .transition().duration(500)
        .attr('opacity', 1)
        .attr('x', vis.config.yAxisWidth)
        .attr('y', d => d.rank * (vis.config.barHeight + vis.config.barSpacing))
        .attr('height', d => vis.config.barHeight)
        .attr('width', d => vis.xScale(d.time));

    vis.textG = vis.chart.selectAll('g')
        .data(vis.data.filter(d => d.rank >= 0))
        .join('g')
        .attr('opacity', 0)
        .attr('transform', d => `translate(${vis.config.yAxisWidth},${d.rank * (vis.config.barHeight + vis.config.barSpacing)})`);

    vis.textG.append('text')
        .attr('class', 'chart-label')
        .attr('text-anchor', 'end')
        .attr('x', -5)
        .attr('y', vis.config.barHeight/2)
        .attr('dy', '0.35em')
        .text(d => d.name);

    vis.textG.append('text')
        .attr('class', 'chart-label')
        .attr('x', 5)
        .attr('y', vis.config.barHeight/2)
        .attr('dy', '0.35em')
        .text(d => d.time);

    vis.textG.transition().duration(800)
        .attr('opacity', 1);
  }
  
  goToStep(stepIndex) {
    this[this.config.steps[stepIndex]]();
  }
}