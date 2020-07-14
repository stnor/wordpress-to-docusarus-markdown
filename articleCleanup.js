const visit = require("unist-util-visit");
const util = require("util");
const htmlentities = require("he");

// function cleanupPost(postData) {
//     return postData.replace(/\n\n/g, "</p>").replace(/import/g, "\\import");
// }

function articleCleanup() {
    return (markdownAST) => {
        visit(markdownAST, "text", (node, index, parent) => {
            node.value = htmlentities.decode(node.value);
            node.value = node.value.replace(/https\:/, "https:");
            node.value = node.value.replace(/http\:/, "http:");

            if (
                node.value &&
                node.value.startsWith("http") &&
                parent.type !== "link"
            ) {
                node.type = "text";
                node.title = null;
            }

            return node;
        });
    };
}

module.exports = articleCleanup;
