const { format } = require("date-fns");
const fetch = require("node-fetch");

var xml2js = require("xml2js");
var fs = require("fs");
var util = require("util");
const slugify = require("slugify");

const unified = require("unified");
const parseHTML = require("rehype-parse");
const rehype2remark = require("rehype-remark");
const stringify = require("remark-stringify");

processExport();

function processExport() {
    var parser = new xml2js.Parser();
    fs.readFile("sample_export.xml", function(err, data) {
        if (err) {
            console.log("Error: " + err);
        }

        parser.parseString(data, function(err, result) {
            if (err) {
                console.log("Error parsing xml: " + err);
            }
            console.log("Parsed XML");

            var posts = result.rss.channel[0].item;

            fs.mkdir("out", function() {
                for (var i = 0; i < posts.length; i++) {
                    processPost(posts[i]);
                    return;
                    //console.log(util.inspect(posts[i]));
                }
            });
        });
    });
}

async function processPost(post) {
    console.log("Processing Post");

    var postTitle = post.title;
    console.log("Post title: " + postTitle);
    var postDate = new Date(post.pubDate);
    console.log("Post Date: " + postDate);
    var postData = post["content:encoded"][0];
    console.log("Post length: " + postData.length + " bytes");
    var slug = post["wp:post_name"];
    console.log("Post slug: " + slug);

    slug = `${slug}` || slugify(`${postTitle}`, { remove: /[*+~.()'"!:@]/g });

    if (!slug) {
        return;
    }

    let directory = `${format(postDate, "yyyy-MM-dd")}-${slug}`;
    let fname = `index.mdx`;

    try {
        fs.mkdirSync(`out/${directory}`);
        fs.mkdirSync(`out/${directory}/img`);
    } catch (e) {
        directory = directory + "-2";
        fs.mkdirSync(`out/${directory}`);
        fs.mkdirSync(`out/${directory}/img`);
    }

    //Merge categories and tags into tags
    var categories = [];
    if (post.category != undefined) {
        for (var i = 0; i < post.category.length; i++) {
            var cat = post.category[i]["_"];
            if (cat != "Uncategorized") categories.push(cat);
            //console.log('CATEGORY: ' + util.inspect(post.category[i]['_']));
        }
    }

    //Find all images
    var patt = new RegExp('(?:src="(.*?)")', "gi");

    var m;
    var matches = [];
    while ((m = patt.exec(postData)) !== null) {
        matches.push(m[1]);
        //console.log("Found: " + m[1]);
    }

    if (matches != null && matches.length > 0) {
        for (var i = 0; i < matches.length; i++) {
            //console.log('Post image found: ' + matches[i])

            var url = matches[i];
            var urlParts = matches[i].split("/");
            var imageName = urlParts[urlParts.length - 1];

            var filePath = `out/${directory}/img/${imageName}`;

            try {
                await downloadFile(url, filePath);
                //Make the image name local relative in the markdown
                postData = postData.replace(url, `./img/${imageName}`);
            } catch (e) {
                console.log(`Keeping ref to ${url}`);
                console.log(e);
            }
        }
    }

    const markdown = await new Promise((resolve, reject) => {
        unified()
            .use(parseHTML, {
                emitParseErrors: true,
                duplicateAttribute: false
            })
            .use(rehype2remark)
            .use(stringify)
            .process(postData, (err, markdown) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(markdown.contents);
                }
            });
    });

    var header = "";
    header += "---\n";
    header += "layout: post\n";
    header += "title: " + postTitle + "\n";
    header +=
        "date: " +
        postDate.getFullYear() +
        "-" +
        getPaddedMonthNumber(postDate.getMonth() + 1) +
        "-" +
        getPaddedDayNumber(postDate.getDate()) +
        "\n";
    if (categories.length > 0) {
        header += "categories: " + categories.join(", ") + "\n";
    }
    header += "author: Swizec Teller\n";
    header += "---\n";
    header += "\n";

    fs.writeFile(`out/${directory}/${fname}`, header + markdown, function(
        err
    ) {});
}

async function downloadFile(url, path) {
    //console.log("Attempt downloading " + url + " to " + path + ' ' + url.indexOf("https:") );
    if (
        url.indexOf(".jpg") >= 0 ||
        url.indexOf(".jpeg") >= 0 ||
        url.indexOf(".png") >= 0 ||
        url.indexOf(".gif") >= 0 ||
        url.indexOf(".svg") >= 0
    ) {
        const response = await fetch(url);
        if (response.status >= 400) {
            throw new Error("Bad response from server");
        } else {
            const type = response.headers.get("Content-Type");

            if (type.includes("image") || type.includes("octet-stream")) {
                const buffer = await response.arrayBuffer();
                fs.writeFileSync(path, new Buffer(buffer));
            } else {
                throw new Error("Not an image", url);
            }
        }

        // wget(url, { output: path })
        //     .then(meta => {
        //         console.log(meta.headers);

        //         if (!meta.headers["content-type"].includes("image")) {
        //             fs.unlinkSync(path);
        //             throw new Error();
        //         }
        //     })
        //     .catch(err => {
        //         console.log(err);
        //         console.log("Error downloading", url);
        //     });
    } else {
        console.log("passing 2");
        console.log("passing on: " + url + " " + url.indexOf("https:"));
    }
}
function getPaddedMonthNumber(month) {
    if (month < 10) return "0" + month;
    else return month;
}

function getPaddedDayNumber(day) {
    if (day < 10) return "0" + day;
    else return day;
}
