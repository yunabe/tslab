export default function plotHtml(
  width = 200,
  height = 200,
  ...args: any[]
) {
  const plotId = "_plotly-dav" + Math.random().toString(36).substr(2, 9);
  return `
    <div
      id="${plotId}"
      style="width:${width + 50}px;height:${height + 50}px;">
    </div>
    <script>
      if (!window.__PlotlyPromise){
        window.__PlotlyPromise = fetch('https://cdn.plot.ly/plotly-latest.min.js')
        .then(response => response.text().then(script => {
          // define = undefined so that requirejs doesn't interfere in vscode
          eval('{var define = undefined;'+script+'}');
          return window.Plotly;
        }))
      }
      {
        const plotId = "${plotId}";
        window.plotly_runs = window.plotly_runs || {}
        clearTimeout(window.plotly_runs[plotId])
        window.plotly_runs[plotId] = setTimeout(() => {
          const plotContainer = document.getElementById("${plotId}")
          window.__PlotlyPromise.then(Plotly => {
              const args = ${JSON.stringify(args)};
              ((container, data, layout = {}) => {
                  layout = {
                      margin: { l: 50, r: 50, b: 50, t: 50 },
                      ...layout,
                  };
                  return Plotly.newPlot(container, data, layout);
              })(plotContainer,...args)
          }).catch(e => {
            plotContainer.innerText = e.message + '\\n' + e.stack
          })
        } , 100)
      }  
    </script>
    `;
} 