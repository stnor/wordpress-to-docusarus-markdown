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
    fs.readFile("export.xml", function(err, data) {
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
                posts
                    .filter(p => p["wp:post_type"][0] === "post")
                    .forEach(processPost);
            });
        });
    });
}

async function processImage({ url, postData, images, directory }) {
    var urlParts = url.split("/");
    var imageName = urlParts[urlParts.length - 1];

    var filePath = `out/${directory}/img/${imageName}`;

    try {
        await downloadFile(url, filePath);
        //Make the image name local relative in the markdown
        postData = postData.replace(url, `./img/${imageName}`);
        images = [...images, `./img/${imageName}`];
    } catch (e) {
        console.log(`Keeping ref to ${url}`);
        console.log(e);
    }

    return [postData, images];
}

async function processPost(post) {
    console.log("Processing Post");

    var postTitle = typeof post.title === "string" ? post.title : post.title[0];
    console.log("Post title: " + postTitle);
    var postDate = new Date(post.pubDate);
    console.log("Post Date: " + postDate);
    var postData = post["content:encoded"][0];
    console.log("Post length: " + postData.length + " bytes");
    const slug = slugify(postTitle, {
        remove: /[^\w\s]/g
    }).toLowerCase();
    console.log("Post slug: " + slug);

    const heroURLs = post["wp:postmeta"]
        .filter(
            meta =>
                meta["wp:meta_key"][0].includes("opengraph-image") ||
                meta["wp:meta_key"][0].includes("twitter-image")
        )
        .map(meta => meta["wp:meta_value"][0])
        .filter(url => url.startsWith("http"));

    let heroImage = "";

    try {
        format(postDate, "yyyy-MM-dd");
    } catch (e) {
        console.log("INAVLID TIME", postDate);
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
    let images = [];

    var m;
    var matches = [];
    while ((m = patt.exec(postData)) !== null) {
        matches.push(m[1]);
        //console.log("Found: " + m[1]);
    }

    if (matches != null && matches.length > 0) {
        for (var i = 0; i < matches.length; i++) {
            var url = matches[i];
            [postData, images] = await processImage({
                url,
                postData,
                images,
                directory
            });
        }
    }

    if (heroURLs.length > 0) {
        const url = heroURLs[0];
        [postData, images] = await processImage({
            url,
            postData,
            images,
            directory
        });
        heroImage = images[images.length - 1];
    } else {
        heroImage = images[0];
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

    try {
        postTitle.replace("\\", "\\\\").replace(/"/g, '\\"');
    } catch (e) {
        console.log("FAILED REPLACE", postTitle);
    }

    let header = [
        "---",
        "layout: post",
        `title: '${postTitle.replace(/'/g, "''")}'`,
        `date: ${format(postDate, "yyyy-MM-dd")}`
    ];

    if (categories.length > 0) {
        header.push("categories: " + categories.join(", "));
    }

    header.push("author: Swizec Teller");
    header.push(`hero: ${heroImage}`);
    header.push("---");
    header.push("");

    fs.writeFile(
        `out/${directory}/${fname}`,
        header.join("\n") + markdown,
        function(err) {}
    );
}

async function downloadFile(url, path) {
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
