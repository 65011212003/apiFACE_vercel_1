import express, { Request, Response } from 'express';
import mysql, { Query } from 'mysql';
import bcrypt from 'bcrypt';
import cors from 'cors';
import multer, { Multer } from "multer";
import path from 'path';
import { initializeApp } from "firebase/app";
import { getStorage, ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';

const app = express();

app.use(
    cors({
        origin: "*",
    })
);

// Create a MySQL connection pool
const db = mysql.createPool({
    host: '202.28.34.197',
    user: 'web66_65011212003',
    password: '65011212003@csmsu',
    database: 'web66_65011212003',
});

// Middleware to parse JSON in the request body
app.use(express.json());

// Endpoint to get all users
app.get('/users', (req: Request, res: Response) => {
    const query = 'SELECT * FROM Users';

    db.query(query, (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Internal Server Error' });
        }

        res.json(results);
    });
});

// Endpoint to get a specific user by ID
app.get('/users/:id', (req: Request, res: Response) => {
    const userId = req.params.id;
    const query = 'SELECT * FROM Users WHERE UserID = ?';

    db.query(query, [userId], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Internal Server Error' });
        }

        if (results.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json(results[0]);
    });
});

app.post('/register', async (req: Request, res: Response) => {
    const { display_name, username, password, avatarURL } = req.body;

    // Check if the username already exists
    const checkUsernameQuery = 'SELECT * FROM Users WHERE Username = ?';

    db.query(checkUsernameQuery, [username], async (checkErr, checkResults) => {
        if (checkErr) {
            console.error(checkErr);
            return res.status(500).json({ error: 'Internal Server Error' });
        }

        // If the username already exists, return an error
        if (checkResults.length > 0) {
            return res.status(400).json({ error: 'Username already exists' });
        }

        // Hash the password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insert the user into the database
        const insertUserQuery = 'INSERT INTO Users (display_name , Username, Password, AvatarURL) VALUES (?, ?, ?, ?)';

        db.query(insertUserQuery, [display_name, username, hashedPassword, avatarURL], (insertErr, results) => {
            if (insertErr) {
                console.error(insertErr);
                return res.status(500).json({ error: 'Internal Server Error' });
            }

            res.json({ userId: results.insertId, message: 'User created successfully' });
        });
    });
});



// Endpoint for user login
app.post('/login', (req: Request, res: Response) => {
    const { username, password } = req.body;

    // Check if username and password are provided
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }

    // Check if the user exists in the database
    const query = 'SELECT * FROM Users WHERE Username = ?';

    db.query(query, [username], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Internal Server Error' });
        }

        if (results.length === 0) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        // Compare the provided password with the hashed password from the database
        const user = results[0];
        bcrypt.compare(password, user.Password, (bcryptErr, bcryptResult) => {
            if (bcryptErr) {
                console.error(bcryptErr);
                return res.status(500).json({ error: 'Internal Server Error' });
            }

            if (!bcryptResult) {
                return res.status(401).json({ error: 'Invalid username or password' });
            }

            // Passwords match, user is authenticated
            res.json({ userId: user.UserID, message: 'Login successful' });
        });
    });
});

app.get('/randomImages', (req: Request, res: Response) => {
    const query = 'SELECT * FROM Images WHERE EloScore BETWEEN (1500 - 300) AND (1500 + 300) ORDER BY RAND() LIMIT 2';

    db.query(query, (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Internal Server Error' });
        }

        res.json(results);
    });
});


//     const eloRange = 300;

//     const query = `
//       SELECT I.*, U.display_name
//       FROM Images I
//       JOIN Users U ON I.UserID = U.UserID
//       WHERE I.EloScore BETWEEN ? AND ?
//         AND U.UserID != I.UserID
//       ORDER BY RAND()
//       LIMIT 2
//     `;

//     const eloMin = 1500 - eloRange;
//     const eloMax = 1500 + eloRange;

//     db.query(query, [eloMin, eloMax], (err, results) => {
//         if (err) {
//             console.error(err);
//             return res.status(500).json({ error: 'Internal Server Error' });
//         }

//         res.json(results);
//     });
// });



interface Image {
    ImageID: number;
    EloScore: number;
    // Add other properties as needed
}


// Endpoint to record a vote with Elo rating update
app.post('/vote', (req: Request, res: Response) => {
    const { voterID, winImageID, loseImageID } = req.body;

    // Check if all required parameters are provided
    if (!voterID || !winImageID || !loseImageID) {
        return res.status(400).json({ error: 'Voter ID, Win Image ID, and Lose Image ID are required' });
    }

    // Check if the voter exists
    const userQuery = 'SELECT * FROM Users WHERE UserID = ?';

    db.query(userQuery, [voterID], (userErr, userResults) => {
        if (userErr) {
            console.error(userErr);
            return res.status(500).json({ error: 'Internal Server Error user' });
        }

        if (userResults.length === 0) {
            return res.status(404).json({ error: 'Voter not found' });
        }

        // Check if the win image and lose image exist
        const imageQuery = 'SELECT * FROM Images WHERE ImageID IN (?, ?)';

        db.query(imageQuery, [winImageID, loseImageID], (imageErr, imageResults) => {
            if (imageErr) {
                console.error(imageErr);
                return res.status(500).json({ error: 'Internal Server Error images' });
            }

            if (imageResults.length < 2) {
                return res.status(404).json({ error: 'One or more images not found' });
            }

            const winImage: Image | undefined = imageResults.find((image: Image) => image.ImageID === winImageID);
            const loseImage: Image | undefined = imageResults.find((image: Image) => image.ImageID === loseImageID);

            // Check if winImage and loseImage are defined
            if (!winImage || !loseImage) {
                return res.status(404).json({ error: 'One or more images not found' });
            }

            // Update Elo scores using the Elo rating algorithm
            const eloK = 32; // Adjust this value based on your preferences
            const expectedWinProbability = 1 / (1 + 10 ** ((loseImage.EloScore - winImage.EloScore) / 400));

            winImage.EloScore += eloK * (1 - expectedWinProbability);
            loseImage.EloScore += eloK * (0 - (1 - expectedWinProbability));

            // Update Elo scores in the database
            const updateQuery = 'UPDATE Images SET EloScore = ? WHERE ImageID = ?';

            db.query(updateQuery, [winImage.EloScore, winImageID], (updateErr1) => {
                if (updateErr1) {
                    console.error(updateErr1);
                    return res.status(500).json({ error: `Internal Server Error update ELOSCORE WIN: ${updateErr1.message}` });
                }

                db.query(updateQuery, [loseImage.EloScore, loseImageID], (updateErr2) => {
                    if (updateErr2) {
                        console.error(updateErr2);
                        return res.status(500).json({ error: `Internal Server Error update ELOSCORE LOSE: ${updateErr2.message}` });
                    }

                    // Insert the vote into the database
                    const voteQuery = 'INSERT INTO Votes (VoterID, WinImageID, LoseImageID) VALUES (?, ?, ?)';

                    db.query(voteQuery, [voterID, winImageID, loseImageID], (voteErr) => {
                        if (voteErr) {
                            console.error(voteErr);
                            return res.status(500).json({ error: `Internal Server Error insert Votes: ${voteErr.message}` });
                        }

                        res.json({ message: 'Vote recorded successfully' });
                    });
                });
            });
        });
    });
});



// Update user information endpoint
app.put('/users/:id', (req, res) => {
    const userId = parseInt(req.params.id);
    const { Username, Password, AvatarURL } = req.body;

    // Check if the required fields are present
    if (!Username && !Password && !AvatarURL) {
        return res.status(400).json({ error: 'At least one field (Username, Password, AvatarURL) is required for update' });
    }

    // Construct the SQL query to update the user
    let updateQuery = 'UPDATE Users SET ';
    const values = [];

    if (Username) {
        updateQuery += 'Username=?, ';
        values.push(Username);
    }

    if (Password) {
        updateQuery += 'Password=?, ';
        values.push(Password);
    }

    if (AvatarURL) {
        updateQuery += 'AvatarURL=?, ';
        values.push(AvatarURL);
    }

    // Remove the trailing comma and complete the query
    updateQuery = updateQuery.slice(0, -2);
    updateQuery += ' WHERE UserID=?';
    values.push(userId);

    // Execute the update query
    db.query(updateQuery, values, (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Internal Server Error' });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ message: 'User updated successfully' });
    });
});


app.delete('/users/:id', (req, res) => {
    const userId = parseInt(req.params.id);

    // Construct the SQL query to delete the user
    const deleteQuery = 'DELETE FROM Users WHERE UserID=?';

    // Execute the delete query
    db.query(deleteQuery, [userId], (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Internal Server Error' });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ message: 'User deleted successfully' });
    });
});


app.get('/top-rated', (req, res) => {
    // Construct the SQL query to get the top 10 rated users with display names
    const topRatedQuery = `
        SELECT Images.*, Users.display_name
        FROM Images
        JOIN Users ON Images.UserID = Users.UserID
        ORDER BY Images.EloScore DESC
        LIMIT 10
    `;

    // Execute the query
    db.query(topRatedQuery, (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Internal Server Error' });
        }

        res.json(results);
    });
});


app.put('/change-image/:userId', async (req: Request, res: Response) => {
    const userId = req.params.userId;
    const { newImageUrl } = req.body;

    if (!newImageUrl) {
        return res.status(400).json({ error: 'New image URL is required' });
    }

    try {
        // Update the image URL in the database
        const updateQuery = 'UPDATE Images SET ImageURL = ? WHERE UserID = ?';
        db.query(updateQuery, [newImageUrl, userId], (error, results) => {
            if (error) {
                throw error;
            }

            // Check if any rows were affected (image updated successfully)
            if (results.affectedRows > 0) {
                res.json({ message: 'Image updated successfully' });
            } else {
                res.status(404).json({ error: 'User not found or image update failed' });
            }
        });
    } catch (error) {
        console.error('Error updating image:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});


app.get('/view-image/:userId', (req: Request, res: Response) => {
    // Assuming you have user authentication in place, and you get the user ID from the authenticated user.
    const userId = req.params.userId;

    // Get the user's image list
    const getUserImagesQuery = `SELECT * FROM Images WHERE UserID = ? ORDER BY EloScore DESC`;
    db.query(getUserImagesQuery, [userId], (getUserImagesErr, userImages) => {
        if (getUserImagesErr) {
            return res.status(500).json({ error: 'Internal Server Error' });
        }

        // Get the user's daily statistics
        // const getDailyStatsQuery = `SELECT * FROM DailyStatistics WHERE UserID = ? ORDER BY Date DESC LIMIT 2`;
        // db.query(getDailyStatsQuery, [userId], (getDailyStatsErr, dailyStats) => {
        //     if (getDailyStatsErr) {
        //         return res.status(500).json({ error: 'Internal Server Error' });
        //     }

        // Calculate ranking changes
        // const todayWins = dailyStats[0]?.Wins || 0;
        // const yesterdayWins = dailyStats[1]?.Wins || 0;
        // const rankingChange = todayWins - yesterdayWins;

        // Send the response with user images and ranking changes
        // res.json({ userImages, rankingChange });
        res.json({ userImages });
    });
});





const firebaseConfig = {
    apiKey: "AIzaSyDHM3guYBRRloid5lGpcmVe5ldCvBRh3uE",
    authDomain: "tripbookingbyjoe.firebaseapp.com",
    projectId: "tripbookingbyjoe",
    storageBucket: "tripbookingbyjoe.appspot.com",
    messagingSenderId: "52023133809",
    appId: "1:52023133809:web:797a8df9184a180419bdd0",
    measurementId: "G-H1JMHRNKPD"
};

// Initialize Firebase
initializeApp(firebaseConfig);

const storage = getStorage();

class FileMiddleware {
    // Attribute file name
    filename = "";

    // Create object of diskloader for saving file
    public readonly diskLoader = multer({
        // Storage = define folder (disk) to be saved 🙂
        storage: multer.memoryStorage(),
        limits: {
            fileSize: 67108864, // 64 MByte
        },
    });

}


const fileUpload = new FileMiddleware();

app.post("/upload", fileUpload.diskLoader.single("123"), async (req, res) => {
    try {
        const filename = Date.now() + "-" + Math.round(Math.random() * 10000) + ".png";
        const storageRef = ref(storage, "/images/" + filename);
        const metadata = {
            contentType: req.file!.mimetype
        };

        const uploadTask = await uploadBytesResumable(storageRef, req.file!.buffer, metadata);
        const url = await getDownloadURL(uploadTask.ref);


        const insertQuery = 'INSERT INTO Images (UserID, ImageURL) VALUES (?, ?)';
        const ID = 1;

        db.query(insertQuery, [ID, url], (err, result) => {
            if (err) {
                console.error('Error inserting into Images table:', err);
                res.status(500).json({ error: 'Internal server error' });
            } else {
                res.status(200).json({
                    file: url,
                });
            }
        });
    } catch (error) {
        console.error("Error uploading file:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
});



app.delete('/deleteImage/:imageId', async (req: Request, res: Response) => {
    const imageId = req.params.imageId;

    // Check if the image exists in the database
    const checkImageQuery = 'SELECT * FROM Images WHERE ImageID = ?';

    db.query(checkImageQuery, [imageId], async (checkErr, checkResults) => {
        if (checkErr) {
            console.error(checkErr);
            return res.status(500).json({ error: 'Internal Server Error' });
        }

        // If the image doesn't exist, return an error
        if (checkResults.length === 0) {
            return res.status(404).json({ error: 'Image not found' });
        }

        // Get the image URL from the database
        const imageUrl = checkResults[0].ImageURL;

        try {
            // Delete the image from Firebase Storage
            const storageRef = ref(storage, imageUrl);
            await deleteObject(storageRef);

            // Delete the image from the database
            const deleteQuery = 'DELETE FROM Images WHERE ImageID = ?';
            db.query(deleteQuery, [imageId], (deleteErr, result) => {
                if (deleteErr) {
                    console.error(deleteErr);
                    return res.status(500).json({ error: 'Internal Server Error' });
                }

                res.json({ message: 'Image deleted successfully' });
            });
        } catch (error) {
            console.error('Error deleting image:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    });
});


app.put('/updateImage/:imageId', fileUpload.diskLoader.single('123'), async (req, res) => {
    try {
        const imageId = req.params.imageId;

        // Check if the image exists in the database
        const checkImageQuery = 'SELECT * FROM Images WHERE ImageID = ?';

        db.query(checkImageQuery, [imageId], async (checkErr, checkResults) => {
            if (checkErr) {
                console.error(checkErr);
                return res.status(500).json({ error: 'Internal Server Error' });
            }

            // If the image doesn't exist, return an error
            if (checkResults.length === 0) {
                return res.status(404).json({ error: 'Image not found' });
            }

            // Get the current image URL from the database
            const currentImageUrl = checkResults[0].ImageURL;

            // Delete the current image from Firebase Storage
            const currentStorageRef = ref(storage, currentImageUrl);
            await deleteObject(currentStorageRef);

            // Upload the updated image to Firebase Storage
            const updatedFilename = Date.now() + '-' + Math.round(Math.random() * 10000) + '.png';
            const updatedStorageRef = ref(storage, '/images/' + updatedFilename);
            const metadata = {
                contentType: req.file!.mimetype
            };

            const uploadTask = await uploadBytesResumable(updatedStorageRef, req.file!.buffer, metadata);
            const updatedImageUrl = await getDownloadURL(uploadTask.ref);

            // Update the image URL in the database
            const updateQuery = 'UPDATE Images SET ImageURL = ? WHERE ImageID = ?';
            db.query(updateQuery, [updatedImageUrl, imageId], (updateErr, result) => {
                if (updateErr) {
                    console.error(updateErr);
                    return res.status(500).json({ error: 'Internal Server Error' });
                }

                res.status(200).json({
                    message: 'Image updated successfully',
                    file: updatedImageUrl,
                });
            });
        });
    } catch (error) {
        console.error('Error updating image:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});



app.listen(3000, () => console.log('Server ready on port 3000.'));

export default app;
