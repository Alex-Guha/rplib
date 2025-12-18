import d3 from 'd3';

export default function resetZoom(rootDOM, canvasDOM) {
    const zoom = d3.zoom()
        .scaleExtent([0.25, 2])
        .on('zoom', (event) => (canvasDOM.attr('transform', event.transform)));

    rootDOM.call(zoom)
        .on("dblclick.zoom", null)
        .on("touchstart.zoom", null)
        .on("touchstart.zoom", function(event) {
            d3.zoom().touchable(this, event);
        }, { passive: true });

    // Function to apply the centered zoom transform
    const applyCenteredZoom = (firstChild) => {
        const svgNode = rootDOM.node();
        const svgRect = svgNode.getBoundingClientRect();
        
        // Calculate the center Y position based on first item and SVG height
        const scale = 0.70;
        const centerY = (svgRect.height / 2) - (firstChild.getAttribute('y') * scale) - (firstChild.getAttribute('height') / 2 * scale) - (svgRect.height / 16);

        rootDOM.transition().duration(500).call(
            zoom.transform,
            d3.zoomIdentity.translate(100, centerY).scale(scale)
        );
    };

    // Check if content is already available, otherwise wait for it
    const firstChild = canvasDOM.node()?.firstElementChild;
    if (firstChild) {
        // Content is available, apply zoom immediately
        applyCenteredZoom(firstChild);
    } else {
        // Wait for content to be rendered, then apply zoom
        const checkForContent = () => {
            const firstChild = canvasDOM.node()?.firstElementChild;
            if (firstChild) {
                applyCenteredZoom(firstChild);
            } else {
                // Check again after a short delay
                setTimeout(checkForContent, 50);
            }
        };
        // Start checking after a small initial delay
        setTimeout(checkForContent, 50);
    }
}